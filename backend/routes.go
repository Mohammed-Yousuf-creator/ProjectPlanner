package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey int

const paramsKey contextKey = 0

// Params returns route parameters extracted from the request path.
func Params(r *http.Request) map[string]string {
	if p, ok := r.Context().Value(paramsKey).(map[string]string); ok {
		return p
	}
	return nil
}

func withParams(h http.HandlerFunc, params map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(context.WithValue(r.Context(), paramsKey, params))
		h(w, r)
	}
}

// matchPath matches a pattern (may contain :param segments) against a path.
// Returns the captured params if it matches, nil otherwise.
func matchPath(pattern, path string) (map[string]string, bool) {
	pParts := strings.Split(strings.Trim(pattern, "/"), "/")
	uParts := strings.Split(strings.Trim(path, "/"), "/")
	if len(pParts) != len(uParts) {
		return nil, false
	}
	params := map[string]string{}
	for i, pp := range pParts {
		up := uParts[i]
		if strings.HasPrefix(pp, ":") {
			params[pp[1:]] = up
		} else if pp != up {
			return nil, false
		}
	}
	return params, true
}

// route is a single method+path registration.
type route struct {
	method  string
	pattern string
	handler http.HandlerFunc
}

// router matches incoming requests to registered routes.
type router struct {
	routes []route
}

func (rt *router) handle(method, pattern string, h http.HandlerFunc) {
	rt.routes = append(rt.routes, route{method: method, pattern: pattern, handler: h})
}

func (rt *router) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	for _, route := range rt.routes {
		if r.Method != route.method {
			continue
		}
		if params, ok := matchPath(route.pattern, r.URL.Path); ok {
			withParams(route.handler, params)(w, r)
			return
		}
	}
	http.NotFound(w, r)
}

func enableCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}
