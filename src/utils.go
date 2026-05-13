package main

// Package main provides utility functions for string sanitization
// used throughout the HireKey application for input validation.

import (
	"strings"
	"unicode"
)

// isAllowedChar determines whether a rune is permitted in a sanitized string.
// When allowPunctuation is true, Unicode punctuation, symbols, and spaces are included.
func isAllowedChar(r rune, allowPunctuation bool) bool {
	// Allow letters, digits
	if unicode.IsLetter(r) || unicode.IsDigit(r) {
		return true
	}
	// Allow specific punctuation marks
	if allowPunctuation {
		if unicode.IsPunct(r) || unicode.IsSymbol(r) || unicode.IsSpace(r) {
			return true
		}
	}
	// Exclude all others
	return false
}

// sanitizeString removes disallowed characters from a string, trimming
// leading and trailing whitespace. When allowPunctuation is true,
// Unicode punctuation and symbols are preserved; otherwise only letters
// and digits are kept.
func sanitizeString(input string, allowPunctuation bool) string {
	input = strings.TrimSpace(input)
	var sanitized []rune
	for _, r := range input {
		if isAllowedChar(r, allowPunctuation) {
			sanitized = append(sanitized, r)
		}
	}
	return string(sanitized)
}
