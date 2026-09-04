package main

import (
	"net/http/httptest"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	r := httptest.NewRecorder()
	writeJSON(r, 200, map[string]string{"status": "ok"})
	if got := r.Header().Get("Content-Type"); got != "application/json" { t.Fatalf("content type = %q", got) }
	if got := r.Body.String(); got != "{\"status\":\"ok\"}\n" { t.Fatalf("body = %q", got) }
}
