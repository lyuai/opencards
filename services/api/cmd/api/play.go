package main

import (
	"errors"
	"sort"
)

type combination struct {
	Type  string `json:"type"`
	Size  int    `json:"size"`
	Power int    `json:"power"`
}

func classify(cards []playingCard) (combination, error) {
	if len(cards) == 0 {
		return combination{}, errors.New("select at least one card")
	}
	counts := map[string]int{}
	for _, card := range cards {
		counts[card.Rank]++
	}
	groups := make([]int, 0, len(counts))
	for _, count := range counts {
		groups = append(groups, count)
	}
	sort.Ints(groups)
	high := highestRank(cards)
	if len(cards) == 1 {
		return combination{Type: "single", Size: 1, Power: high}, nil
	}
	if len(cards) == 2 && len(counts) == 1 {
		return combination{Type: "pair", Size: 2, Power: high}, nil
	}
	if len(cards) == 3 && len(counts) == 1 {
		return combination{Type: "triple", Size: 3, Power: high}, nil
	}
	if len(cards) == 4 && counts["SJ"] == 2 && counts["BJ"] == 2 {
		return combination{Type: "joker_bomb", Size: 4, Power: 100}, nil
	}
	if len(counts) == 1 && len(cards) >= 4 {
		return combination{Type: "rank_bomb", Size: len(cards), Power: high}, nil
	}
	if len(cards) == 5 && len(groups) == 2 && groups[0] == 2 && groups[1] == 3 {
		return combination{Type: "full_house", Size: 5, Power: tripleRank(counts)}, nil
	}
	if len(cards) == 5 && consecutive(counts, 1) {
		if sameSuit(cards) {
			return combination{Type: "straight_flush", Size: 5, Power: high}, nil
		}
		return combination{Type: "straight", Size: 5, Power: high}, nil
	}
	if len(cards) == 6 && consecutive(counts, 2) {
		return combination{Type: "consecutive_pairs", Size: 6, Power: high}, nil
	}
	if len(cards) == 6 && consecutive(counts, 3) {
		return combination{Type: "consecutive_triples", Size: 6, Power: high}, nil
	}
	return combination{}, errors.New("selected cards do not form a supported combination")
}

func beats(next, previous combination) bool {
	if next.Type == "joker_bomb" {
		return previous.Type != "joker_bomb"
	}
	if previous.Type == "joker_bomb" {
		return false
	}
	if next.Type == "straight_flush" && previous.Type != "straight_flush" && previous.Type != "rank_bomb" {
		return true
	}
	if next.Type == "rank_bomb" {
		if previous.Type == "straight_flush" {
			return next.Size >= 6
		}
		if previous.Type != "rank_bomb" {
			return true
		}
		return next.Size > previous.Size || next.Size == previous.Size && next.Power > previous.Power
	}
	if previous.Type == "rank_bomb" || previous.Type == "straight_flush" && next.Type != "straight_flush" {
		return false
	}
	return next.Type == previous.Type && next.Size == previous.Size && next.Power > previous.Power
}

func highestRank(cards []playingCard) int {
	high := -1
	for _, card := range cards {
		if rankOrder[card.Rank] > high {
			high = rankOrder[card.Rank]
		}
	}
	return high
}
func tripleRank(counts map[string]int) int {
	for rank, count := range counts {
		if count == 3 {
			return rankOrder[rank]
		}
	}
	return -1
}
func sameSuit(cards []playingCard) bool {
	suit := cards[0].Suit
	if suit == "★" {
		return false
	}
	for _, card := range cards[1:] {
		if card.Suit != suit {
			return false
		}
	}
	return true
}
func consecutive(counts map[string]int, each int) bool {
	values := make([]int, 0, len(counts))
	for rank, count := range counts {
		if count != each || rank == "2" || rank == "SJ" || rank == "BJ" {
			return false
		}
		values = append(values, rankOrder[rank])
	}
	sort.Ints(values)
	for index := 1; index < len(values); index++ {
		if values[index] != values[index-1]+1 {
			return false
		}
	}
	return len(values) > 1
}
