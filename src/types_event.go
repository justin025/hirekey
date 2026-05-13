package main

import "go.mongodb.org/mongo-driver/bson/primitive"

// EventEntry represents an event document in the events MongoDB collection.
type EventEntry struct {
	Id               primitive.ObjectID `bson:"_id,omitempty"`
	Location         string             `bson:"location"`
	Time             string             `bson:"time"`
	Date             string             `bson:"date"`
	Team             string             `bson:"team"`
	EventImage       string             `bson:"event_image"`
	EventTitle       string             `bson:"event_title"`
	EventDescription string             `bson:"event_description"`
	ContactName      string             `bson:"contact_name"`
	ContactEmail     string             `bson:"contact_email"`
	ContactPhone     string             `bson:"contact_phone"`
	RsvpCount        int                `bson:"rsvp_count"`
}

// EventData is the serialized form of an event for API responses, including
// the client-side RSVP state.
type EventData struct {
	Id               string `json:"_id"`
	Location         string `json:"location"`
	Time             string `json:"time"`
	Date             string `json:"date"`
	Team             string `json:"team"`
	EventImage       string `json:"event_image"`
	EventTitle       string `json:"event_title"`
	EventDescription string `json:"event_description"`
	ContactName      string `json:"contact_name"`
	ContactEmail     string `json:"contact_email"`
	ContactPhone     string `json:"contact_phone"`
	RsvpCount        int    `json:"rsvp_count"`
	IsRsvped         bool   `json:"is_rsvped"`
}

// EventCreateRequest represents the JSON body for creating a new event.
type EventCreateRequest struct {
	Location         string `json:"location"`
	Time             string `json:"time"`
	Date             string `json:"date"`
	Team             string `json:"team"`
	EventImage       string `json:"event_image"`
	EventTitle       string `json:"event_title"`
	EventDescription string `json:"event_description"`
	ContactName      string `json:"contact_name"`
	ContactEmail     string `json:"contact_email"`
	ContactPhone     string `json:"contact_phone"`
}

// EventListResponse is the JSON response returned by the event list API.
type EventListResponse struct {
	Query  string      `json:"query"`
	Events []EventData `json:"events"`
}

// EventCreateResponse is the JSON response returned after creating a new event.
type EventCreateResponse struct {
	Message string    `json:"message"`
	Event   EventData `json:"event"`
}

// EventRSVPEntry represents an RSVP record in the database.
type EventRSVPEntry struct {
	EventID   primitive.ObjectID `bson:"event_id"`
	ProfileID primitive.ObjectID `bson:"profile_id"`
	Time      int64              `bson:"time"`
}

// EventRSVPRequest represents the JSON body for RSVPing to an event.
type EventRSVPRequest struct {
	EventID string `json:"event_id"`
}

// EventRSVPResponse is the JSON response returned after RSVPing to an event.
type EventRSVPResponse struct {
	EventID   string `json:"event_id"`
	IsRsvped  bool   `json:"is_rsvped"`
	RsvpCount int    `json:"rsvp_count"`
}

// ProfileEventListResponse is the JSON response returned by the profile events API.
type ProfileEventListResponse struct {
	ProfileID string      `json:"profile_id"`
	Events    []EventData `json:"events"`
}
