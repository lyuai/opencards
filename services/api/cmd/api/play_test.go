package main

import "testing"

func TestClassifyCoreCombinations(t *testing.T) {
	tests := []struct {
		name  string
		cards []playingCard
		want  string
	}{
		{"single", []playingCard{{Rank: "A", Suit: "♠"}}, "single"},
		{"pair", []playingCard{{Rank: "7", Suit: "♠"}, {Rank: "7", Suit: "♥"}}, "pair"},
		{"triple", []playingCard{{Rank: "7"}, {Rank: "7"}, {Rank: "7"}}, "triple"},
		{"full house", []playingCard{{Rank: "7"}, {Rank: "7"}, {Rank: "7"}, {Rank: "9"}, {Rank: "9"}}, "full_house"},
		{"straight", []playingCard{{Rank: "3", Suit: "♠"}, {Rank: "4", Suit: "♥"}, {Rank: "5", Suit: "♠"}, {Rank: "6", Suit: "♠"}, {Rank: "7", Suit: "♠"}}, "straight"},
		{"straight flush", []playingCard{{Rank: "3", Suit: "♠"}, {Rank: "4", Suit: "♠"}, {Rank: "5", Suit: "♠"}, {Rank: "6", Suit: "♠"}, {Rank: "7", Suit: "♠"}}, "straight_flush"},
		{"rank bomb", []playingCard{{Rank: "Q"}, {Rank: "Q"}, {Rank: "Q"}, {Rank: "Q"}}, "rank_bomb"},
		{"joker bomb", []playingCard{{Rank: "SJ"}, {Rank: "SJ"}, {Rank: "BJ"}, {Rank: "BJ"}}, "joker_bomb"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := classify(test.cards)
			if err != nil || got.Type != test.want {
				t.Fatalf("got %#v, %v", got, err)
			}
		})
	}
}

func TestBombBeatsOrdinaryPlay(t *testing.T) {
	if !beats(combination{Type: "rank_bomb", Size: 4, Power: 3}, combination{Type: "single", Size: 1, Power: 14}) {
		t.Fatal("bomb should beat single")
	}
	if beats(combination{Type: "pair", Size: 2, Power: 14}, combination{Type: "rank_bomb", Size: 4, Power: 3}) {
		t.Fatal("pair should not beat bomb")
	}
}
