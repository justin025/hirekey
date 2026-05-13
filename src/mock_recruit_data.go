package main

// Package main provides mock recruitment candidate data seeding for HireKey's recruiting feature.

import (
	"context"
	"math/rand"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
)

// mockRecruitSeed defines the template data for a mock recruitment candidate.
type mockRecruitSeed struct {
	name        string
	latitude    float64
	longitude   float64
	description string
	industry    string
	education   string
}

// seedMockRecruitData seeds mock recruitment candidate records into MongoDB with
// geographic coordinates for map-based display.
func seedMockRecruitData(ctx context.Context) error {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	recruitSeeds := []mockRecruitSeed{
		{name: "Avery Chen", latitude: 43.6532, longitude: -79.3832, description: "Assembly quality specialist with a process-improvement mindset.", industry: "Automotive", education: "Bachelor of Arts"},
		{name: "Liam Patel", latitude: 43.5890, longitude: -79.6441, description: "Production coordinator experienced in fast-paced manufacturing.", industry: "Automotive", education: "Bachelor of Commerce"},
		{name: "Noah Singh", latitude: 43.7315, longitude: -79.7624, description: "Safety-focused line lead with hands-on shift management experience.", industry: "Advanced Manufacturing", education: "Bachelor of Engineering"},
		{name: "Emma Rivera", latitude: 43.8561, longitude: -79.3370, description: "Procurement analyst skilled in supplier onboarding and forecasting.", industry: "Supply Chain", education: "Bachelor of Arts"},
		{name: "Olivia Tran", latitude: 43.8828, longitude: -79.4403, description: "Warehouse planner optimizing inbound and outbound operations.", industry: "Logistics", education: "Bachelor of Business Administration"},
		{name: "Sophia Brown", latitude: 43.8668, longitude: -79.2663, description: "Detail-driven quality engineer working on defect reduction programs.", industry: "Automotive", education: "Bachelor of Applied Science"},
		{name: "Mason Wilson", latitude: 43.5890, longitude: -79.7305, description: "Electrical maintenance technician supporting high-volume facilities.", industry: "Energy", education: "Bachelor of Engineering"},
		{name: "Lucas Martin", latitude: 43.7988, longitude: -79.1399, description: "Customer operations specialist with strong KPI ownership.", industry: "Telecommunications", education: "Bachelor of Arts"},
		{name: "Isabella Scott", latitude: 43.8509, longitude: -79.0204, description: "Program assistant experienced in municipal and regional projects.", industry: "Public Sector", education: "Bachelor of Arts"},
		{name: "Mia Lee", latitude: 43.8975, longitude: -78.9429, description: "Route optimization analyst with practical dispatch tooling expertise.", industry: "Transportation", education: "Bachelor of Science"},
		{name: "Ethan Adams", latitude: 43.7001, longitude: -79.4163, description: "Project coordinator supporting cross-functional engineering teams.", industry: "Construction", education: "Bachelor of Arts"},
		{name: "Amelia Young", latitude: 43.6426, longitude: -79.3871, description: "Operations associate skilled in scheduling, reporting, and audits.", industry: "Hospitality", education: "Bachelor of Arts"},
		{name: "James Hall", latitude: 43.6711, longitude: -79.3305, description: "Inventory controller focused on stock accuracy and replenishment.", industry: "Retail", education: "Bachelor of Business Administration"},
		{name: "Charlotte King", latitude: 43.7181, longitude: -79.5180, description: "People operations coordinator with recruiting and onboarding experience.", industry: "Human Resources", education: "Bachelor of Arts"},
		{name: "Benjamin Moore", latitude: 43.6383, longitude: -79.4244, description: "Field support specialist with mobile equipment troubleshooting skills.", industry: "Industrial Services", education: "Bachelor of Technology"},
	}

	collection := client.Database(DBName).Collection("recruits")

	for _, seed := range recruitSeeds {
		doc := RecruitData{
			Name:        seed.name,
			Latitude:    seed.latitude,
			Longitude:   seed.longitude,
			Description: seed.description,
			Industry:    seed.industry,
			Education:   seed.education,
			Photo:       randomPicsumURL(rng, "recruit-photo-"+toSeedToken(seed.name), 240, 240),
		}

		recruitFilter := bson.M{"name": doc.Name}
		recruitSetDoc := bson.M{
			"name":        doc.Name,
			"latitude":    doc.Latitude,
			"longitude":   doc.Longitude,
			"description": doc.Description,
			"industry":    doc.Industry,
			"education":   doc.Education,
			"photo":       doc.Photo,
		}
		err := upsertMockDocumentWithDuplicateFallback(
			ctx,
			collection,
			recruitFilter,
			recruitSetDoc,
			bson.M{},
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func toSeedToken(value string) string {
	token := strings.TrimSpace(strings.ToLower(value))
	token = strings.ReplaceAll(token, " ", "-")
	return token
}
