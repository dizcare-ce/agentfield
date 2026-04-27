package cron

import (
	"testing"
	"time"
)

func TestParseExpression_Basic(t *testing.T) {
	cases := []struct {
		expr    string
		wantErr bool
	}{
		{"* * * * *", false},
		{"*/5 * * * *", false},
		{"0 0 * * 0", false},
		{"0 9-17 * * 1-5", false},
		{"60 * * * *", true},
		{"a b c d e", true},
		{"* * * *", true},
	}
	for _, c := range cases {
		_, err := parseExpression(c.expr)
		gotErr := err != nil
		if gotErr != c.wantErr {
			t.Errorf("parseExpression(%q): wantErr=%v gotErr=%v (err=%v)", c.expr, c.wantErr, gotErr, err)
		}
	}
}

func TestSchedule_NextEveryFiveMinutes(t *testing.T) {
	s, err := parseExpression("*/5 * * * *")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	loc := time.UTC
	now := time.Date(2026, 4, 27, 12, 7, 30, 0, loc)
	next := s.Next(now)
	want := time.Date(2026, 4, 27, 12, 10, 0, 0, loc)
	if !next.Equal(want) {
		t.Fatalf("Next(%v) = %v, want %v", now, next, want)
	}
}
