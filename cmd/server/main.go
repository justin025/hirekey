// Package main provides the entry point for the HireKey application.
// HireKey is a social networking and recruitment platform built with Go
// and MongoDB, featuring cookie-based authentication, two-factor authentication,
// real-time chat, marketplace, events, and a professional feed system.
package main

import (
	"hirekey/src"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	log.Println("HireKey starting...")
	src.Main()

	// Wait for interrupt signal for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	log.Println("HireKey shutting down...")
}
