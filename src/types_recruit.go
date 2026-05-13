package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// RecruitData represents a recruitment candidate document, including
// geographic coordinates for map-based display and professional details.
type RecruitData struct {
	Id          primitive.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name        string             `bson:"name" json:"name"`
	Latitude    float64            `bson:"latitude" json:"latitude"`
	Longitude   float64            `bson:"longitude" json:"longitude"`
	Description string             `bson:"description" json:"description"`
	Industry    string             `bson:"industry" json:"industry"`
	Education   string             `bson:"education" json:"education"`
	Photo       string             `bson:"photo" json:"photo"`
}
