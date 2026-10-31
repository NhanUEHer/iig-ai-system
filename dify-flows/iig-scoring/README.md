# IIG AI scoring workflows

This directory contains one Dify workflow per TOEIC Speaking/Writing scoring branch. Each workflow grades one candidate response for one question.

## Shared contract

- Model: `gemini-3.8-flash`
- Maximum output tokens are task-specific. The progressive Q1–Q2 and Q3–Q4
  flows use `2000` for scoring, `2500` for errors, and `1500` for comments.
- Temperature: `0.1`
- Thinking: disabled with `thinking_budget: 0` and `thinking_mode: false`
- LLM output: structured integer component scores only
- Final score: arithmetic mean of component scores, rounded half up by the Code node
- Workflow output: component scores plus `final_score`; no rationale

## Workflow mapping

| Scorer type | TOEIC questions | Dify file | Inputs | Final range |
| --- | --- | --- | --- | --- |
| `READ_TEXT_ALOUD` | Speaking Q1-Q2 | `01-read-text-aloud.yml` | `text_passage`, `transcribe`, `student_audio` | 0-3 |
| `DESCRIBE_PICTURE` | Speaking Q3-Q4 | `02-describe-a-picture.yml` | `image`, `transcribe`, `student_audio` | 0-3 |
| `RESPOND_TO_QUESTIONS` | Speaking Q5-Q7 | `03-respond-to-questions.yml` | `context`, `question`, `transcribe`, `student_audio` | 0-3 |
| `RESPOND_USING_INFORMATION` | Speaking Q8-Q10 | `04-respond-using-information.yml` | `image`, `context`, `question`, `transcribe`, `student_audio` | 0-3 |
| `EXPRESS_AN_OPINION` | Speaking Q11 | `05-express-an-opinion-v2.yml` | validated Q11 contract, upstream transcript, `student_audio` | 0-5 |
| `WRITE_SENTENCE_PICTURE` | Writing Q1-Q5 | `06-write-sentence-picture.yml` | `image`, `keyword`, `student_writing` | 0-3 |
| `RESPOND_TO_WRITTEN_REQUEST` | Writing Q6-Q7 | `07-respond-to-written-request.yml` | `image`, `question`, `student_writing` | 0-4 |
| `WRITE_OPINION_ESSAY` | Writing Q8 | `08-write-opinion-essay.yml` | `question`, `student_writing` | 0-5 |

## Read Text Aloud group workflow

`01-read-text-aloud-group-v1.yml` is a separate lightweight workflow called by
the backend after both Q1 and Q2 question workflows are complete. It accepts the
locked question score array as `questions_json`, asks Gemini for one structured
group score, and deterministically enforces the approved Q1-Q2 matrix before
returning `rta-group-result-v1`. It never receives audio, transcript, errors or
comments.

## Import and publish

Import each YAML file as a separate Dify Workflow application. Confirm that the Gemini marketplace plugin and `gemini-3.8-flash` model are available, run one known regression sample, and only then publish the workflow and save its API key for backend routing.

The workflows intentionally remain separate. A failure or prompt change in one TOEIC task type therefore does not affect the other scoring branches.

## Describe a Picture progressive workflows

For the new AI-scoring service, import `02-describe-a-picture-v2.yml` for each
Q3/Q4 question and `02-describe-a-picture-group-v1.yml` for the final group
decision. These are additive replacements for the legacy single-pass
`02-describe-a-picture.yml`; do not overwrite the legacy app while validating.
The complete contract and rollout order are documented in
`docs/describe-picture-q3-q4-dify-contract-v1.md`.

## Express an Opinion progressive workflow

For the new AI-scoring service, import `05-express-an-opinion-v2.yml`. It emits
score, error, comment, and completed events and returns one holistic 0–5 score.
The seven component scores are diagnostic inputs and are not averaged into the
official score. Because Q11 is a one-question score group, the backend copies
the validated final question score to the group result without another Dify
call. See `docs/express-opinion-q11-dify-contract-v1.md`.
