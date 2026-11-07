# Outside proof: real multi-agent incident and benchmark data

Our multi-agent detection used to be measured only on scenarios we wrote. These are results on data from outside the
project: a real swarm-of-agents intrusion, and real model traces from a public benchmark. Both are held out — nothing
was trained or tuned on them.

## 1. Swarm Traces incident (covert channels, SG-029)

[Swarm Traces](https://swarmtraces.org/) is the reassembled payload set from a real intrusion by a swarm of agents,
with credentials and infrastructure redacted by its publishers. It is ~190k rows of payloads, recovered text and
responses. We treat every row as evidence (read as text, never executed) and score it with the SG-029 covert-transfer
detector. Reproduce with `python scripts/fetch_swarm_traces.py && python scripts/analyze_swarm_traces.py`.

| | Result |
|---|---|
| Attack rows scored | 166,571 |
| Flagged as covert staged transfer | 32,718 |
| Benign baseline (ordinary agent/web output) | 16 samples, **0 flagged** |

Which signals fired: credential sent outside 27,510; assemble-and-run 9,440; decoder-plus-executor 8,810; remote-script
pull 1,039; fragment chain 350.

**Honest reading.** The detector is deliberately conservative: it needs two signals, or a credential leaving. It
flags the loader and exfiltration rows, not every inert data fragment, so the headline is "32,718 real covert-transfer
rows caught with zero benign false positives", not a percentage of all rows. The `fragment_chain` signal is
undercounted here because the next-hop URLs were redacted (`[SHORTENER URL ...]`), so the visible `//` the shape needs
is gone; on live, un-redacted traffic it would fire far more.

**Coordination structure.** The same data shows real agent-to-agent spread: 28,086 distinct destinations, of which
**1,535 were reached from more than one agent identifier**, one of them from 2,165 different identifiers. That shared
fan-out is the multi-agent-oversight signal — many agents funnelling to the same drop points.

## 2. AgentDojo traces (injection classifier, SG-028)

[AgentDojo](https://github.com/ethz-spylab/agentdojo) (ETH Zurich, MIT) publishes every run of its benchmark: real
model conversations where an attacker's text was planted in a tool result. We replay the tool results through the
SG-028 classifier (`python scripts/fetch_agentdojo_runs.py && python scripts/replay_agentdojo.py`). Five models, none
of which the classifier trained on.

| | Result |
|---|---|
| Attacked tool results | 2,810 |
| Caught (recall) | **0.66** |
| Clean tool results | 1,841 |
| False positives | 0.10 |

Per model, recall is steady (Claude 3.5 Sonnet 0.61, Gemini 2.0 Flash 0.65, GPT-4o 0.65, GPT-4o-mini 0.65,
Llama 3.3 70B 0.70). The 10% false-positive rate on clean results is higher than on our own workspace documents (0%):
AgentDojo's clean tool results are long emails, calendars and transaction lists, and the linear model over-fires on
some. This is the classifier's honest ceiling, and the reason the behaviour rules and the egress controls stay the
real enforcement. It also measures only the content signal; in a live run SG-012 and the tripwire act on what the
agent does next.

## 3. collusion.wiki (content-blind coordination monitor)

[collusion.wiki](https://collusion.wiki/) (Von Arx et al., 2026) is ~14.6k revisions by autonomous agents that used
small volunteer wikis as a message board (May-July 2026): the same shape as the METR / Redwood Hugging Face incident,
where ~1,200 agents talked through names in a shared package cache. Labels: one per revision (coordinating or not),
from an LLM labelling pass, spot-checked by us. They are weak labels: the "not coordinating" class still contains relay
infrastructure (pages of chained proxy links and pointers to other agents' pages), so coordination is undercounted.
Reproduce: `python -I scripts/analyze_collusion_wiki.py <dataset dir> <revision labels>`.

The monitor never reads text; it sees which page, which author identity, which network prefix, and when.

| | Result |
|---|---|
| Store alert: 50 distinct agents writing to one wiki within 3 hours | 26 May, **~500 hours (21 days) before** the first revision labelled coordination (16 June) |
| Per revision: "continues a page last written by another agent" | precision 0.34, recall 0.74 (base rate 0.28) |
| SG-029 (covert transfer, reads text) | 0 of 14,591 flagged |

**Honest reading.** Watching *how many agents converge on one shared store* is a strong, early, content-blind signal:
it would have marked this wiki as a multi-agent board three weeks before the labelled live coordination. Telling
*which edits* are coordination is not possible without content: on a store that exists for agents to talk, almost every
edit is one agent continuing another's page. SG-029 is the wrong tool here: these agents relayed plain-text answers
and link chains, not encoded loaders. What an investigator still misses without content: what was relayed, which
relay changed an outcome, and coordination through stores the gateway does not see.

## 4. Forensics on the swarm: who talked to whom, and the gateway view

Track 4 asks for a tool that reconstructs who talked to whom and how information spread, tests whether coordination
could be flagged early, and states what an investigator would still miss; and separately, whether a monitor that sees
only egress and tool calls can detect the coordinated exfiltration. `scripts/swarm_traces_forensics.py` uses only the
redaction placeholders (identifiers, destinations) and `parent_id` links, never what a payload says.

| | Result |
|---|---|
| Identifiers / destinations | 6,133 / 13,338 |
| Destinations shared by 2+ identifiers | 1,335 (the largest by 2,118 identifiers) |
| Identifiers linked into one cluster through shared destinations | **74%** (4,524 of 6,133): one swarm, not many |
| Gateway monitor (destination already used by 3+ identifiers), payloads flagged | 25.9% |
| SG-029 (reads content), payloads flagged | 26.7% |
| **Either** | **40.1%**: they overlap on only 11,408 payloads |
| Top 20 shared drop points flagged | 20/20 by each, at about the same point in the data |

**Honest reading.** A content-blind gateway sees the swarm's structure clearly: almost three quarters of the
identities converge on shared drop points, which no single-agent monitor would notice. It catches a different quarter
of the payloads than the content detector, so the two belong together. What an investigator still misses: *what* was
moved (the gateway can't read it); *how addresses spread* (only 15 destinations are seen learned from a response and
then used, because next-hop URLs were redacted); *when* (the data has no timestamps, so "early" is by row order only);
and *whether identifiers are distinct agents* (they are the redaction's pseudonyms). All rows are attack data, so
coverage is measured but the gateway's false-alarm rate is not; collusion.wiki (section 3) is the closest benign-ish
comparison.
