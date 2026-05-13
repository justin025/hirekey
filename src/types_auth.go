package main

// Package main defines authentication-related types for the HireKey application.

import "go.mongodb.org/mongo-driver/bson/primitive"

// LoginEntry represents a user login credential document in the logins MongoDB collection.
// The IsLocked flag is used during the signup flow to indicate pending 2FA verification.
type LoginEntry struct {
	Id          primitive.ObjectID `bson:"_id"`
	RelId       string             `bson:"rel_id"`
	Username    string             `bson:"username"`
	FirstName   string             `bson:"first_name"`
	LastName    string             `bson:"last_name"`
	PhoneNumber string             `bson:"phone_number"`
	Email       string             `bson:"email"`
	Password    string             `bson:"password"`
	IsLocked    bool               `bson:"is_locked"`
	IsBanned    bool               `bson:"is_banned"`
}

// ActiveSessionEntry represents an active user session document in the active_sessions
// MongoDB collection. It tracks the session UID, login time, IP address, and expiry.
type ActiveSessionEntry struct {
	Uid        string `bson:"uid"`
	Username   string `bson:"username"`
	LoginTime  int64  `bson:"login_time"`
	LoginIP    string `bson:"login_ip"`
	ExpiryTime int64  `bson:"expiry_time"`
}

// AuthCookiePayload is the JSON-serializable structure stored in the auth cookie
// as Base64URL encoding. It contains user identification and profile data for
// client-side access without additional database queries.
type AuthCookiePayload struct {
	Uid               string `json:"uid"`
	Username          string `json:"username"`
	FirstName         string `json:"first_name"`
	LastName          string `json:"last_name"`
	Email             string `json:"email"`
	Phone             string `json:"phone_number"`
	ProfilePictureURL string `json:"profile_picture_url"`
	ExpiryTime        int64  `json:"expiry_time"`
}
