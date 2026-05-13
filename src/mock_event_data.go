package main

// Package main provides mock event data seeding for HireKey's events feature.

import (
	"context"
	"math/rand"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// mockEventSeed defines the template data for a mock event.
type mockEventSeed struct {
	location         string
	time             string
	date             string
	team             string
	eventImage       string
	eventTitle       string
	eventDescription string
	contactName      string
	contactEmail     string
	contactPhone     string
}

// seedMockEventData seeds mock event records into MongoDB for demo purposes.
func seedMockEventData(ctx context.Context) error {
	rng := randomSeededRng(time.Now().UnixNano())
	eventSeeds := []mockEventSeed{
		{
			location:         "Toronto, ON",
			time:             "7:00 PM",
			date:             "2026-03-12",
			team:             "Hirkey Wolves",
			eventImage:       randomPicsumURL(rng, "event-wolves", 1280, 720),
			eventTitle:       "Spring Kickoff Meetup",
			eventDescription: "Team introductions, product roadmap updates, and open networking.",
			contactName:      "Avery Reed",
			contactEmail:     "events-toronto@hirkey.com",
			contactPhone:     "+1 416 555 1034",
		},
		{
			location:         "Mississauga, ON",
			time:             "6:30 PM",
			date:             "2026-03-18",
			team:             "Hirkey Raptors",
			eventImage:       randomPicsumURL(rng, "event-raptors", 1280, 720),
			eventTitle:       "Community Builder Night",
			eventDescription: "Local creators and organizers sharing recruiting and growth strategies.",
			contactName:      "Jordan Park",
			contactEmail:     "events-mississauga@hirkey.com",
			contactPhone:     "+1 905 555 1022",
		},
		{
			location:         "Vaughan, ON",
			time:             "1:00 PM",
			date:             "2026-03-21",
			team:             "Hirkey North",
			eventImage:       randomPicsumURL(rng, "event-north", 1280, 720),
			eventTitle:       "Weekend Skills Camp",
			eventDescription: "Hands-on workshops focused on job readiness and profile optimization.",
			contactName:      "Taylor Scott",
			contactEmail:     "events-vaughan@hirkey.com",
			contactPhone:     "+1 289 555 1083",
		},
		{
			location:         "Brampton, ON",
			time:             "5:30 PM",
			date:             "2026-03-24",
			team:             "Hirkey Chargers",
			eventImage:       randomPicsumURL(rng, "event-chargers", 1280, 720),
			eventTitle:       "Hiring Pipeline Session",
			eventDescription: "Practical session on interview prep, referrals, and rapid follow-ups.",
			contactName:      "Morgan Patel",
			contactEmail:     "events-brampton@hirkey.com",
			contactPhone:     "+1 905 555 1170",
		},
		{
			location:         "Markham, ON",
			time:             "11:00 AM",
			date:             "2026-03-29",
			team:             "Hirkey East",
			eventImage:       randomPicsumURL(rng, "event-east", 1280, 720),
			eventTitle:       "Founders and Operators Brunch",
			eventDescription: "Startup operators discussing execution frameworks and team scaling.",
			contactName:      "Cameron Li",
			contactEmail:     "events-markham@hirkey.com",
			contactPhone:     "+1 416 555 1219",
		},
		{
			location:         "Oakville, ON",
			time:             "4:00 PM",
			date:             "2026-04-03",
			team:             "Hirkey West",
			eventImage:       randomPicsumURL(rng, "event-west", 1280, 720),
			eventTitle:       "Career Momentum Forum",
			eventDescription: "Panel on transitions, promotions, and role-fit in changing markets.",
			contactName:      "Riley Morgan",
			contactEmail:     "events-oakville@hirkey.com",
			contactPhone:     "+1 905 555 1194",
		},
	}

	eventsCollection := client.Database(DBName).Collection("events")
	seededEventIDs := make([]primitive.ObjectID, 0, len(eventSeeds))
	for _, eventSeed := range eventSeeds {
		entry := EventEntry{
			Location:         sanitizeString(eventSeed.location, true),
			Time:             sanitizeString(eventSeed.time, true),
			Date:             sanitizeString(eventSeed.date, true),
			Team:             sanitizeString(eventSeed.team, true),
			EventImage:       sanitizeString(eventSeed.eventImage, true),
			EventTitle:       sanitizeString(eventSeed.eventTitle, true),
			EventDescription: sanitizeString(eventSeed.eventDescription, true),
			ContactName:      sanitizeString(eventSeed.contactName, true),
			ContactEmail:     sanitizeString(eventSeed.contactEmail, true),
			ContactPhone:     sanitizeString(eventSeed.contactPhone, true),
		}

		type seededEventEntry struct {
			Id primitive.ObjectID `bson:"_id"`
		}
		eventFilter := bson.M{
			"event_title": entry.EventTitle,
			"date":        entry.Date,
			"time":        entry.Time,
		}
		eventUpdate := bson.M{
			"$set": bson.M{
				"location":          entry.Location,
				"time":              entry.Time,
				"date":              entry.Date,
				"team":              entry.Team,
				"event_image":       entry.EventImage,
				"event_title":       entry.EventTitle,
				"event_description": entry.EventDescription,
				"contact_name":      entry.ContactName,
				"contact_email":     entry.ContactEmail,
				"contact_phone":     entry.ContactPhone,
			},
			"$setOnInsert": bson.M{
				"_id":          primitive.NewObjectID(),
				"rsvp_count":   0,
				"created_time": time.Now().Unix(),
			},
		}
		runEventUpsert := func(enableUpsert bool) *mongo.SingleResult {
			findOneAndUpdateOptions := options.FindOneAndUpdate().SetReturnDocument(options.After)
			if enableUpsert {
				findOneAndUpdateOptions.SetUpsert(true)
			}
			return eventsCollection.FindOneAndUpdate(
				ctx,
				eventFilter,
				eventUpdate,
				findOneAndUpdateOptions,
			)
		}

		result := runEventUpsert(true)
		var seededEntry seededEventEntry
		if err := result.Decode(&seededEntry); err != nil {
			if mongo.IsDuplicateKeyError(err) {
				retryResult := runEventUpsert(false)
				if retryErr := retryResult.Decode(&seededEntry); retryErr != nil {
					return retryErr
				}
			} else {
				return err
			}
		}
		if seededEntry.Id.IsZero() {
			continue
		}
		seededEventIDs = append(seededEventIDs, seededEntry.Id)
	}

	if len(seededEventIDs) == 0 {
		return nil
	}

	profilesCollection := client.Database(DBName).Collection("profiles")
	profileCursor, err := profilesCollection.Find(
		ctx,
		bson.M{},
		options.Find().
			SetProjection(bson.M{"_id": 1}).
			SetSort(bson.D{{Key: "username", Value: 1}}).
			SetLimit(60),
	)
	if err != nil {
		return err
	}
	defer profileCursor.Close(ctx)

	type mockProfileIDEntry struct {
		Id primitive.ObjectID `bson:"_id"`
	}

	profileIDs := make([]primitive.ObjectID, 0, 60)
	for profileCursor.Next(ctx) {
		var entry mockProfileIDEntry
		if decodeErr := profileCursor.Decode(&entry); decodeErr != nil {
			continue
		}
		if entry.Id.IsZero() {
			continue
		}
		profileIDs = append(profileIDs, entry.Id)
	}
	if err := profileCursor.Err(); err != nil {
		return err
	}

	eventRsvpsCollection := client.Database(DBName).Collection("event_rsvps")
	seededTime := time.Now().Unix()
	for eventIndex, eventID := range seededEventIDs {
		for profileIndex, profileID := range profileIDs {
			if profileID.IsZero() {
				continue
			}
			if (eventIndex+profileIndex)%4 != 0 {
				continue
			}

			_, err = eventRsvpsCollection.UpdateOne(
				ctx,
				bson.M{
					"event_id":   eventID,
					"profile_id": profileID,
				},
				bson.M{
					"$set": bson.M{
						"time": seededTime - int64((eventIndex+1)*600) - int64(profileIndex*45),
					},
					"$setOnInsert": bson.M{
						"event_id":   eventID,
						"profile_id": profileID,
					},
				},
				options.Update().SetUpsert(true),
			)
			if err != nil {
				return err
			}
		}

		rsvpCount64, countErr := eventRsvpsCollection.CountDocuments(ctx, bson.M{"event_id": eventID})
		if countErr != nil {
			return countErr
		}

		_, err = eventsCollection.UpdateOne(
			ctx,
			bson.M{"_id": eventID},
			bson.M{
				"$set": bson.M{
					"rsvp_count": int(rsvpCount64),
				},
			},
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func randomSeededRng(seed int64) *rand.Rand {
	return rand.New(rand.NewSource(seed))
}
