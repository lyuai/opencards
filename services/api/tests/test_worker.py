from opencards_worker.main import difference, stable_candidates, validation


def test_frame_difference_and_stability_filter():
    assert difference(None, [0] * 256) == 100
    assert difference([0] * 256, [10] * 256) == 10
    observations = [
        {"timestampMs": 0}, {"timestampMs": 1000},
        {"timestampMs": 5000}, {"timestampMs": 36000},
    ]
    assert [item["timestampMs"] for item in stable_candidates(observations)] == [1000, 5000, 36000]


def test_timeline_validation_marks_large_gaps():
    result = validation([{"timestampMs": 0}, {"timestampMs": 31000}])
    assert result["status"] == "edited_or_incomplete"
    assert result["potentialJumpCuts"] == 1
