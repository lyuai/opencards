# Validation: BV1Cztq6EE5G

Status: edited or incomplete timeline; not safe to publish as a complete replay.

The complete 938-second source was downloaded and sampled locally. From roughly
938 one-second samples, table-region change detection retained 160 frames and
temporal stabilization retained 31 review candidates.

Manual evidence review found that the candidates match visible table states, but
the source is an edited commentary video rather than one continuous camera record:

- 00:16 and 00:23 show the same club five state.
- 00:34 and 00:59 cut back to an empty table.
- 05:33 repeats the club five state shown near the beginning.
- The later candidates contain long gaps and repeated explanatory scenes.

Therefore the 31 candidates must not be interpreted as 31 sequential plays. The
pipeline needs shot-boundary/replay classification followed by card recognition and
turn-rule validation. Only a segment whose transitions conserve cards and follow
the four-player turn order may be promoted to a replay record.
