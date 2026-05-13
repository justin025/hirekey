package main

// Package main provides API utility functions for resolving the current
// authenticated user profile and writing JSON responses.

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// getCurrentSessionProfile resolves the ProfileData for the currently
// authenticated session. If debug mode is enabled, it falls back to
// resolving by the debug_username query parameter.
func getCurrentSessionProfile(w http.ResponseWriter, r *http.Request) (ProfileData, bool) {
	emptyProfile := ProfileData{}
	if EnableAuthCheck == false {
		return resolveDebugProfile(w, r)
	}

	session, ok := getCurrentActiveSession(w, r)
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return emptyProfile, false
	}

	profileID := sanitizeString(session.Uid, false)
	if profileID == "" {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return emptyProfile, false
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var profile ProfileData
	objectID, err := primitive.ObjectIDFromHex(profileID)
	if err != nil {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return emptyProfile, false
	}

	err = client.Database(DBName).Collection("profiles").FindOne(
		ctx,
		bson.M{"_id": objectID},
	).Decode(&profile)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, `{"error":"Profile not found"}`, http.StatusNotFound)
			return emptyProfile, false
		}
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return emptyProfile, false
	}

	profileUsername := sanitizeString(profile.Username, false)
	if profileUsername == "" {
		http.Error(w, `{"error":"Profile not found"}`, http.StatusNotFound)
		return emptyProfile, false
	}

	sessionUsername := sanitizeString(session.Username, false)
	if sessionUsername == "" || sessionUsername != profileUsername {
		_, _ = client.Database(DBName).Collection("active_sessions").UpdateOne(
			ctx,
			bson.M{"uid": profileID},
			bson.M{"$set": bson.M{"username": profileUsername}},
		)
	}

	return profile, true
}

// resolveDebugProfile resolves a profile by the debug_username query parameter,
// or returns the earliest-created profile if no username is provided.
// This is useful for development when auth is disabled.
func resolveDebugProfile(w http.ResponseWriter, r *http.Request) (ProfileData, bool) {
	emptyProfile := ProfileData{}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	username := sanitizeString(r.URL.Query().Get("debug_username"), false)
	filter := bson.M{}
	findOptions := options.FindOne().SetSort(bson.D{
		{Key: "created_time", Value: 1},
		{Key: "_id", Value: 1},
	})
	if username != "" {
		filter = bson.M{"username": username}
	}

	var profile ProfileData
	err := client.Database(DBName).Collection("profiles").FindOne(
		ctx,
		filter,
		findOptions,
	).Decode(&profile)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			http.Error(w, `{"error":"Profile not found"}`, http.StatusNotFound)
			return emptyProfile, false
		}
		http.Error(w, `{"error":"Database error"}`, http.StatusInternalServerError)
		return emptyProfile, false
	}

	if profile.Id.IsZero() {
		http.Error(w, `{"error":"Profile not found"}`, http.StatusNotFound)
		return emptyProfile, false
	}

	profile.Username = sanitizeString(profile.Username, false)
	if profile.Username == "" {
		http.Error(w, `{"error":"Profile not found"}`, http.StatusNotFound)
		return emptyProfile, false
	}

	return profile, true
}

// resolveProfileByUsername looks up a profile document by username in MongoDB.
// Returns mongo.ErrNoDocuments if the profile does not exist.
func resolveProfileByUsername(ctx context.Context, username string) (ProfileData, error) {
	var profile ProfileData

	sanitizedUsername := sanitizeString(username, false)
	if sanitizedUsername == "" {
		return profile, mongo.ErrNoDocuments
	}

	err := client.Database(DBName).Collection("profiles").FindOne(
		ctx,
		bson.M{"username": sanitizedUsername},
	).Decode(&profile)
	if err != nil {
		return profile, err
	}
	if profile.Id.IsZero() {
		return profile, mongo.ErrNoDocuments
	}

	return profile, nil
}

// writeJSON encodes the given payload as JSON and writes it to the response
// with the appropriate Content-Type header.
func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}
