package main

import (
	"fmt"
	"sync"
	"time"
)

type gameAction struct {
	Index       int           `json:"index"`
	Seat        string        `json:"seat"`
	Kind        string        `json:"kind"`
	Cards       []playingCard `json:"cards,omitempty"`
	Combination *combination  `json:"combination,omitempty"`
}

type gameSession struct {
	ID         string
	Hands      map[string][]playingCard
	Turn       int
	Current    *gameAction
	LastPlayer string
	Passes     int
	History    []gameAction
	Finished   []string
	CreatedAt  time.Time
}

type gameStore struct {
	mu       sync.Mutex
	sessions map[string]*gameSession
}

func newGameStore() *gameStore { return &gameStore{sessions: map[string]*gameSession{}} }

func (store *gameStore) create(deal guandanDeal) *gameSession {
	store.mu.Lock()
	defer store.mu.Unlock()
	session := &gameSession{ID: deal.ID, Hands: deal.Hands, History: []gameAction{}, Finished: []string{}, CreatedAt: deal.CreatedAt}
	store.sessions[session.ID] = session
	return session
}

func (store *gameStore) act(id, seat string, cardIDs []string, pass bool) (map[string]any, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	session, ok := store.sessions[id]
	if !ok {
		return nil, fmt.Errorf("game not found")
	}
	if session.seat() != seat {
		return nil, fmt.Errorf("it is %s's turn", session.seat())
	}
	if err := session.apply(seat, cardIDs, pass); err != nil {
		return nil, err
	}
	for !session.over() && session.seat() != "south" {
		aiSeat := session.seat()
		choice := chooseAIPlay(session.Hands[aiSeat], session.Current, aiSeat == "north")
		_ = session.apply(aiSeat, idsOf(choice), len(choice) == 0)
	}
	return session.view(), nil
}

func (session *gameSession) apply(seat string, cardIDs []string, pass bool) error {
	if pass {
		if session.Current == nil {
			return fmt.Errorf("cannot pass when leading")
		}
		action := gameAction{Index: len(session.History) + 1, Seat: seat, Kind: "pass"}
		session.History = append(session.History, action)
		session.Passes++
		if session.Passes >= session.activePlayers()-1 {
			leader := session.LastPlayer
			session.Current = nil
			session.Passes = 0
			session.Turn = seatIndex(leader)
			if len(session.Hands[leader]) == 0 {
				session.advance()
			}
		} else {
			session.advance()
		}
		return nil
	}
	cards, err := takeCards(session.Hands[seat], cardIDs)
	if err != nil {
		return err
	}
	combo, err := classify(cards)
	if err != nil {
		return err
	}
	if session.Current != nil && !beats(combo, *session.Current.Combination) {
		return fmt.Errorf("play does not beat %s", session.Current.Combination.Type)
	}
	session.Hands[seat] = removeCards(session.Hands[seat], cardIDs)
	action := gameAction{Index: len(session.History) + 1, Seat: seat, Kind: "play", Cards: cards, Combination: &combo}
	session.History = append(session.History, action)
	session.Current = &action
	session.LastPlayer = seat
	session.Passes = 0
	if len(session.Hands[seat]) == 0 {
		session.Finished = append(session.Finished, seat)
	}
	session.advance()
	return nil
}

func (session *gameSession) advance() {
	for attempts := 0; attempts < 4; attempts++ {
		session.Turn = (session.Turn + 1) % 4
		if len(session.Hands[session.seat()]) > 0 {
			return
		}
	}
}
func (session *gameSession) seat() string { return seatOrder[session.Turn] }
func (session *gameSession) activePlayers() int {
	count := 0
	for _, seat := range seatOrder {
		if len(session.Hands[seat]) > 0 {
			count++
		}
	}
	return count
}
func (session *gameSession) over() bool { return len(session.Finished) >= 3 }

func (session *gameSession) view() map[string]any {
	counts := map[string]int{}
	for _, seat := range seatOrder {
		counts[seat] = len(session.Hands[seat])
	}
	coach := coachHint(session)
	return map[string]any{"id": session.ID, "game": "guandan", "yourSeat": "south", "yourHand": session.Hands["south"], "counts": counts, "turn": session.seat(), "currentPlay": session.Current, "history": session.History, "finished": session.Finished, "gameOver": session.over(), "coach": coach, "createdAt": session.CreatedAt}
}

func coachHint(session *gameSession) map[string]any {
	if session.seat() != "south" || session.over() {
		return map[string]any{"available": false}
	}
	choice := chooseAIPlay(session.Hands["south"], session.Current, true)
	if len(choice) == 0 {
		return map[string]any{"available": true, "action": "pass", "cardIds": []string{}, "reason": "No economical legal response; preserve the hand."}
	}
	combo, _ := classify(choice)
	reason := "Lead the lowest economical combination and preserve control cards."
	if session.Current != nil {
		reason = "Use the lowest combination that beats the table and avoid spending a bomb."
	}
	return map[string]any{"available": true, "action": "play", "cardIds": idsOf(choice), "combination": combo, "reason": reason}
}

func takeCards(hand []playingCard, ids []string) ([]playingCard, error) {
	if len(ids) == 0 {
		return nil, fmt.Errorf("select cards or pass")
	}
	wanted := map[string]bool{}
	for _, id := range ids {
		if wanted[id] {
			return nil, fmt.Errorf("duplicate card")
		}
		wanted[id] = true
	}
	found := []playingCard{}
	for _, card := range hand {
		if wanted[card.ID] {
			found = append(found, card)
		}
	}
	if len(found) != len(ids) {
		return nil, fmt.Errorf("card is not in hand")
	}
	return found, nil
}
func removeCards(hand []playingCard, ids []string) []playingCard {
	remove := map[string]bool{}
	for _, id := range ids {
		remove[id] = true
	}
	next := make([]playingCard, 0, len(hand)-len(ids))
	for _, card := range hand {
		if !remove[card.ID] {
			next = append(next, card)
		}
	}
	return next
}
func idsOf(cards []playingCard) []string {
	ids := make([]string, len(cards))
	for i, c := range cards {
		ids[i] = c.ID
	}
	return ids
}
func seatIndex(seat string) int {
	for i, value := range seatOrder {
		if value == seat {
			return i
		}
	}
	return 0
}

func chooseAIPlay(hand []playingCard, current *gameAction, supportive bool) []playingCard {
	candidates := generateCandidates(hand)
	for _, candidate := range candidates {
		combo, _ := classify(candidate)
		if current == nil {
			if combo.Type != "rank_bomb" && combo.Type != "joker_bomb" && combo.Type != "straight_flush" {
				return candidate
			}
		} else if beats(combo, *current.Combination) {
			if supportive && (combo.Type == "rank_bomb" || combo.Type == "joker_bomb") {
				continue
			}
			return candidate
		}
	}
	if supportive && current != nil {
		for _, candidate := range candidates {
			combo, _ := classify(candidate)
			if beats(combo, *current.Combination) {
				return candidate
			}
		}
	}
	return nil
}

func generateCandidates(hand []playingCard) [][]playingCard {
	byRank := map[string][]playingCard{}
	for _, card := range hand {
		byRank[card.Rank] = append(byRank[card.Rank], card)
	}
	result := [][]playingCard{}
	// Ordinary candidates first, ordered by the already sorted hand.
	for _, card := range hand {
		result = append(result, []playingCard{card})
	}
	for size := 2; size <= 3; size++ {
		for _, rank := range orderedRanks() {
			if len(byRank[rank]) >= size {
				result = append(result, append([]playingCard(nil), byRank[rank][:size]...))
			}
		}
	}
	for _, triple := range orderedRanks() {
		if len(byRank[triple]) >= 3 {
			for _, pair := range orderedRanks() {
				if pair != triple && len(byRank[pair]) >= 2 {
					result = append(result, append(append([]playingCard{}, byRank[triple][:3]...), byRank[pair][:2]...))
				}
			}
		}
	}
	sequenceRanks := orderedRanks()[:12]
	for start := 0; start+5 <= len(sequenceRanks); start++ {
		candidate := []playingCard{}
		ok := true
		for offset := 0; offset < 5; offset++ {
			rank := sequenceRanks[start+offset]
			if len(byRank[rank]) == 0 {
				ok = false
				break
			}
			candidate = append(candidate, byRank[rank][0])
		}
		if ok {
			result = append(result, candidate)
		}
	}
	for start := 0; start+3 <= len(sequenceRanks); start++ {
		candidate := []playingCard{}
		ok := true
		for offset := 0; offset < 3; offset++ {
			cards := byRank[sequenceRanks[start+offset]]
			if len(cards) < 2 {
				ok = false
				break
			}
			candidate = append(candidate, cards[:2]...)
		}
		if ok {
			result = append(result, candidate)
		}
	}
	for start := 0; start+2 <= len(sequenceRanks); start++ {
		candidate := []playingCard{}
		ok := true
		for offset := 0; offset < 2; offset++ {
			cards := byRank[sequenceRanks[start+offset]]
			if len(cards) < 3 {
				ok = false
				break
			}
			candidate = append(candidate, cards[:3]...)
		}
		if ok {
			result = append(result, candidate)
		}
	}
	for _, suit := range []string{"♣", "♦", "♥", "♠"} {
		for start := 0; start+5 <= len(sequenceRanks); start++ {
			candidate := []playingCard{}
			ok := true
			for offset := 0; offset < 5; offset++ {
				found := false
				for _, card := range byRank[sequenceRanks[start+offset]] {
					if card.Suit == suit {
						candidate = append(candidate, card)
						found = true
						break
					}
				}
				if !found {
					ok = false
					break
				}
			}
			if ok {
				result = append(result, candidate)
			}
		}
	}
	for size := 4; size <= 8; size++ {
		for _, rank := range orderedRanks() {
			if len(byRank[rank]) >= size {
				result = append(result, append([]playingCard(nil), byRank[rank][:size]...))
			}
		}
	}
	if len(byRank["SJ"]) == 2 && len(byRank["BJ"]) == 2 {
		result = append(result, append(append([]playingCard{}, byRank["SJ"]...), byRank["BJ"]...))
	}
	return result
}
func orderedRanks() []string {
	return []string{"3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2", "SJ", "BJ"}
}
