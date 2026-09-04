package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sort"
	"time"
)

type playingCard struct {
	ID   string `json:"id"`
	Rank string `json:"rank"`
	Suit string `json:"suit"`
}

type guandanDeal struct {
	ID        string                   `json:"id"`
	Game      string                   `json:"game"`
	DeckCount int                      `json:"deckCount"`
	CardCount int                      `json:"cardCount"`
	Hands     map[string][]playingCard `json:"hands"`
	CreatedAt time.Time                `json:"createdAt"`
}

type guandanDealView struct {
	ID        string         `json:"id"`
	Game      string         `json:"game"`
	DeckCount int            `json:"deckCount"`
	CardCount int            `json:"cardCount"`
	YourSeat  string         `json:"yourSeat"`
	YourHand  []playingCard  `json:"yourHand"`
	Counts    map[string]int `json:"counts"`
	CreatedAt time.Time      `json:"createdAt"`
}

// Play proceeds counter-clockwise around the table.
var seatOrder = []string{"south", "east", "north", "west"}
var suitOrder = map[string]int{"♣": 0, "♦": 1, "♥": 2, "♠": 3, "★": 4}
var rankOrder = map[string]int{"3": 0, "4": 1, "5": 2, "6": 3, "7": 4, "8": 5, "9": 6, "10": 7, "J": 8, "Q": 9, "K": 10, "A": 11, "2": 12, "SJ": 13, "BJ": 14}

func newGuandanDeal() (guandanDeal, error) {
	deck := guandanDeck()
	if err := secureShuffle(deck); err != nil {
		return guandanDeal{}, err
	}
	hands := map[string][]playingCard{"south": {}, "west": {}, "north": {}, "east": {}}
	for index, card := range deck {
		seat := seatOrder[index%len(seatOrder)]
		hands[seat] = append(hands[seat], card)
	}
	for _, hand := range hands {
		sort.Slice(hand, func(i, j int) bool {
			if rankOrder[hand[i].Rank] != rankOrder[hand[j].Rank] {
				return rankOrder[hand[i].Rank] < rankOrder[hand[j].Rank]
			}
			if suitOrder[hand[i].Suit] != suitOrder[hand[j].Suit] {
				return suitOrder[hand[i].Suit] < suitOrder[hand[j].Suit]
			}
			return hand[i].ID < hand[j].ID
		})
	}
	now := time.Now().UTC()
	return guandanDeal{
		ID: "deal-" + now.Format("20060102T150405.000000000"), Game: "guandan",
		DeckCount: 2, CardCount: len(deck), Hands: hands, CreatedAt: now,
	}, nil
}

func (deal guandanDeal) viewFor(seat string) guandanDealView {
	counts := make(map[string]int, len(deal.Hands))
	for player, hand := range deal.Hands {
		counts[player] = len(hand)
	}
	return guandanDealView{
		ID: deal.ID, Game: deal.Game, DeckCount: deal.DeckCount, CardCount: deal.CardCount,
		YourSeat: seat, YourHand: deal.Hands[seat], Counts: counts, CreatedAt: deal.CreatedAt,
	}
}

func guandanDeck() []playingCard {
	ranks := []string{"3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"}
	suits := []string{"♣", "♦", "♥", "♠"}
	deck := make([]playingCard, 0, 108)
	for copy := 1; copy <= 2; copy++ {
		for _, rank := range ranks {
			for _, suit := range suits {
				deck = append(deck, playingCard{ID: fmt.Sprintf("%s%s-%d", rank, suit, copy), Rank: rank, Suit: suit})
			}
		}
		deck = append(deck,
			playingCard{ID: fmt.Sprintf("SJ-%d", copy), Rank: "SJ", Suit: "★"},
			playingCard{ID: fmt.Sprintf("BJ-%d", copy), Rank: "BJ", Suit: "★"},
		)
	}
	return deck
}

func secureShuffle(cards []playingCard) error {
	for index := len(cards) - 1; index > 0; index-- {
		value, err := rand.Int(rand.Reader, big.NewInt(int64(index+1)))
		if err != nil {
			return err
		}
		target := int(value.Int64())
		cards[index], cards[target] = cards[target], cards[index]
	}
	return nil
}
