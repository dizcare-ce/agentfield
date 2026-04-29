package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v5"
	_ "github.com/santhosh-tekuri/jsonschema/v5/httploader"
	"gopkg.in/yaml.v3"
)

func main() {
	root := flag.String("root", "./connectors/manifests", "Root directory containing connector manifests")
	flag.Parse()

	// Resolve root to absolute path
	absRoot, err := filepath.Abs(*root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error resolving root path: %v\n", err)
		os.Exit(1)
	}

	// Load JSON Schema from disk - relative to the parent of root
	schemaPath := filepath.Join(filepath.Dir(absRoot), "schema", "connector.schema.json")
	schemaURL := "file://" + schemaPath

	compiledSchema, err := jsonschema.Compile(schemaURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error compiling schema: %v\n", err)
		os.Exit(1)
	}

	// Walk connectors/manifests directory
	manifests, err := findManifests(absRoot)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error walking directory: %v\n", err)
		os.Exit(1)
	}

	totalErrors := 0

	for _, manifestPath := range manifests {
		errs := validateManifest(manifestPath, compiledSchema)
		if len(errs) > 0 {
			totalErrors += len(errs)
			for _, e := range errs {
				fmt.Printf("%s: %s\n", manifestPath, e)
			}
		}
	}

	fmt.Printf("\n%d manifests validated, %d errors\n", len(manifests), totalErrors)

	if totalErrors > 0 {
		os.Exit(1)
	}
}

func findManifests(root string) ([]string, error) {
	var manifests []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		// Skip hidden directories and _template
		if d.IsDir() && (strings.HasPrefix(d.Name(), ".") || d.Name() == "_template") {
			return filepath.SkipDir
		}
		if d.Name() == "manifest.yaml" {
			manifests = append(manifests, path)
		}
		return nil
	})
	return manifests, err
}

func getInt(v any) (int, bool) {
	switch val := v.(type) {
	case float64:
		return int(val), true
	case int:
		return val, true
	case int64:
		return int(val), true
	default:
		return 0, false
	}
}

func validateManifest(path string, schema *jsonschema.Schema) []string {
	var errs []string

	// Parse YAML
	yamlBytes, err := os.ReadFile(path)
	if err != nil {
		return []string{fmt.Sprintf("cannot read file: %v", err)}
	}

	var manifest map[string]any
	if err := yaml.Unmarshal(yamlBytes, &manifest); err != nil {
		return []string{fmt.Sprintf("invalid YAML: %v", err)}
	}

	// Convert YAML to JSON for schema validation
	jsonBytes, _ := json.Marshal(manifest)

	// Validate against JSON Schema
	var data any
	json.Unmarshal(jsonBytes, &data)

	if err := schema.Validate(data); err != nil {
		errs = append(errs, fmt.Sprintf("schema validation: %v", err))
		return errs
	}

	// Cross-check 1: manifest.name matches directory
	parentDir := filepath.Base(filepath.Dir(path))
	if name, ok := manifest["name"].(string); ok {
		if name != parentDir {
			errs = append(errs, fmt.Sprintf("manifest name '%s' does not match parent directory '%s'", name, parentDir))
		}
	}

	// Cross-check 2: Icon file existence
	if ui, ok := manifest["ui"].(map[string]any); ok {
		if icon, ok := ui["icon"].(map[string]any); ok {
			if filePath, ok := icon["file"].(string); ok {
				iconFullPath := filepath.Join(filepath.Dir(path), filePath)
				if _, err := os.Stat(iconFullPath); err != nil {
					errs = append(errs, fmt.Sprintf("ui.icon.file '%s' does not exist", filePath))
				}
			}
		}
	}

	// Cross-check 3: GET operations cannot have body inputs
	if operations, ok := manifest["operations"].(map[string]any); ok {
		for opName, opVal := range operations {
			if op, ok := opVal.(map[string]any); ok {
				if method, ok := op["method"].(string); ok && method == "GET" {
					if inputs, ok := op["inputs"].(map[string]any); ok {
						for inputName, inputVal := range inputs {
							if input, ok := inputVal.(map[string]any); ok {
								if in, ok := input["in"].(string); ok && in == "body" {
									errs = append(errs, fmt.Sprintf("operations.%s: GET method cannot have body input '%s'", opName, inputName))
								}
							}
						}
					}
				}
			}
		}
	}

	// Cross-check 4: Per-op concurrency cap must not exceed connector-level cap
	connectorMaxInFlight := 50
	if concurrency, ok := manifest["concurrency"].(map[string]any); ok {
		if max, ok := concurrency["max_in_flight"]; ok {
			if val, ok := getInt(max); ok {
				connectorMaxInFlight = val
			}
		}
	}

	if operations, ok := manifest["operations"].(map[string]any); ok {
		for opName, opVal := range operations {
			if op, ok := opVal.(map[string]any); ok {
				if concurrency, ok := op["concurrency"].(map[string]any); ok {
					if opMax, ok := concurrency["max_in_flight"]; ok {
						if val, ok := getInt(opMax); ok {
							if val > connectorMaxInFlight {
								errs = append(errs, fmt.Sprintf("operations.%s.concurrency.max_in_flight (%d) exceeds connector concurrency.max_in_flight (%d)", opName, val, connectorMaxInFlight))
							}
						}
					}
				}
			}
		}
	}

	// Cross-check 5: URL template variables match path inputs
	if operations, ok := manifest["operations"].(map[string]any); ok {
		for opName, opVal := range operations {
			if op, ok := opVal.(map[string]any); ok {
				opErrs := validateOperation(opName, op)
				errs = append(errs, opErrs...)
			}
		}
	}

	return errs
}

func validateOperation(opName string, op map[string]any) []string {
	var errs []string

	// Extract URL and inputs
	var urlStr string
	pathInputs := make(map[string]bool)

	if u, ok := op["url"].(string); ok {
		urlStr = u
	}

	if inputs, ok := op["inputs"].(map[string]any); ok {
		for inputName, inputVal := range inputs {
			if input, ok := inputVal.(map[string]any); ok {
				if in, ok := input["in"].(string); ok && in == "path" {
					pathInputs[inputName] = true
				}
			}
		}
	}

	// Extract template variables from URL
	re := regexp.MustCompile(`\{([a-z][a-z0-9_]*)\}`)
	matches := re.FindAllStringSubmatch(urlStr, -1)
	for _, match := range matches {
		varName := match[1]
		if !pathInputs[varName] {
			errs = append(errs, fmt.Sprintf("operations.%s: URL references path variable '{%s}' but no input declares 'in: path'", opName, varName))
		}
	}

	// Check that all path inputs are referenced in URL
	for inputName := range pathInputs {
		if !strings.Contains(urlStr, "{"+inputName+"}") {
			errs = append(errs, fmt.Sprintf("operations.%s: input '%s' declares 'in: path' but is not referenced in URL template", opName, inputName))
		}
	}

	return errs
}
