# TOEIC KEY VOCABULARY — OPTIMIZED KNOWLEDGE BASE

Configure this document metadata in Dify:

```text
domain = toeic
feature = key_vocabulary
content_type = rules_and_topic_priorities
rule_version = 2.0
language = en_vi
level = 650_plus
status = active
priority = critical
```

This document contains 24 intended chunks. Each `## CHUNK-` section is complete and independent. Use the literal marker `<!-- DIFY_CHUNK_SEPARATOR -->` as the custom separator if supported, or create the 24 chunks manually without including the marker.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-01 — Core objective and output scope

Select the most useful business and professional vocabulary actually represented in the input TOEIC passage. Target B1–C1 vocabulary for TOEIC 650+ learners.

Every item must be grounded in the passage, valuable in a professional context, returned in dictionary form, assigned an allowed system part of speech, supplied with British English IPA, and given a concise Vietnamese meaning matching the passage context.

The application output contains only vocabulary text, system part of speech, IPA, and Vietnamese meaning. Four Pillars, evidence, source position, reason, confidence, notes, and debug data are internal and must not appear in the final JSON.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-02 — Quantity and single-word/phrase ratio

Extract between 8 and 15 items. Prefer quality and passage grounding over filling the maximum quantity. Never invent a related word merely to increase the count.

Aim for approximately 80% single words and 20% phrases: 8 items → 6–7 plus 1–2; 9 items → 7 plus 2; 10 items → 8 plus 2; 12 items → 9–10 plus 2–3; 15 items → 12 plus 3.

The ratio never permits weak, absent, duplicated, elementary, or improperly formed vocabulary.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-03 — Business Functional Test

For every candidate, ask: “If a learner knows only this single word, can the learner use or understand it correctly in a professional context?”

- If yes, prefer the single word.
- If no, and the complete expression carries distinct professional value, select the complete phrase.

Good single words: `implement`, `expertise`, `relocate`, `candidate`, `licensed`, `certified`, `invoice`, `tenant`, `reimburse`.

Good phrases: `Board of Directors`, `in a row`, `be delighted to`, `make an effort to`, `in search of`, `quality control`, `direct deposit`.

Do not select a phrase merely because adjacent words occur together. It must add stable professional, technical, grammatical, or idiomatic meaning.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-04 — Phrase-selection rules and priority

Select a phrase only when an isolated component loses the intended meaning, the expression is a fixed collocation/idiom/phrasal verb/title/etiquette pattern/technical compound, and a single word cannot preserve the same learning value.

Priority: fixed expressions (`on behalf of`), phrasal verbs (`follow up`), generic roles (`Board of Directors`), technical compounds (`quality control`), and business etiquette (`be delighted to`).

Prefer `refund` over `refund process` when the head word is sufficient. Keep `quality control` because the compound names a recognized function. Always choose the most compact form that preserves professional meaning.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-05 — Four Pillars: Professional Actions and Roles

The Four Pillars are internal ranking criteria and must not be output.

P1 — Professional Actions: `implement`, `negotiate`, `recruit`, `promote`, `relocate`, `oversee`, `coordinate`, `allocate`, `streamline`, `acquire`, `reimburse`, `examine`, `apply for`, `report directly to`, `be responsible for`, `comply with`.

P2 — Roles and Entities: common professional roles, departments, and participants such as `candidate`, `supervisor`, `recruiter`, `colleague`, `contractor`, `vendor`, `tenant`, `attendee`, `Board of Directors`, `Human Resources Department`.

Select reusable common roles, not specific people or organizations.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-06 — Four Pillars: Expertise and Professional Etiquette

The Four Pillars are internal ranking criteria and must not be output.

P3 — Expertise and Credentials: `licensed`, `certified`, `qualified`, `accredited`, `proficient`, `expertise`, `credential`, `proven track record`, `background in`.

P4 — Professional Collocations and Etiquette: `be delighted to`, `be pleased to`, `welcome on board`, `in a row`, `in search of`, `effective immediately`, `on behalf of`, `with regard to`, `prior to`, `subject to change`, `in accordance with`.

Rank candidates higher when they clearly fit a pillar and have genuine TOEIC 650+ value.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-07 — Exclude proper nouns

Never select names of people, specific companies, brands, products, product features, schools, organizations, roads, cities, buildings, or locations.

Exclude: `Sara Nannup`, `Emily Rogers`, `Rose Spa`, `Allure Center`, `Summit Road`, `Chicago`, `Auto Pay`, `Smart-Track`, `X-200 Laptop`.

Capitalization alone does not make a generic title a proper noun. These may be selected generically: `Board of Directors`, `Customer Support`, `General Manager`, `Outstanding Employee`.

Distinguish a unique entity from a reusable common role, department, title, or function.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-08 — Exclude elementary verbs

Exclude A1/A2 verbs: `go`, `make`, `have`, `get`, `take`, `use`, `need`, `give`, `work`, `come`, `know`, `tell`, `start`, `show`, `run`, `buy`, `pay`, `call`, `find`, `keep`, `help`, `move`, `want`, `say`, `see`, `look`, `ask`, `feel`, `become`, `leave`, `put`, `let`, `begin`, `hear`, `try`, `write`, `thank`, `agree`, `decide`.

A basic verb may remain inside a valuable fixed phrase or phrasal verb. Do not select `make`; `make an effort to` may be valuable. Do not select `take`; `take effect` may be valuable. Do not select `follow`; `follow up` may be valuable when used phrasally.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-09 — Exclude elementary nouns, adjectives, and basic business words

Exclude nouns: `time`, `day`, `year`, `people`, `way`, `part`, `place`, `case`, `week`, `number`, `thing`, `word`, `job`, `area`, `name`, `end`, `price`, `dish`, `dessert`, `room`, `building`, `holiday`.

Exclude adjectives: `good`, `new`, `big`, `small`, `old`, `great`, `high`, `long`, `right`, `early`, `free`, `available`, `latest`, `bright`, `happy`.

Exclude basic business words: `meeting`, `office`, `email`, `phone`, `mobile`, `trip`, `visit`, `app`, `website`, `online`, `description`, `detail`, `price`, and generic `staff`.

An elementary component may remain only inside a genuinely valuable fixed or technical expression.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-10 — Exclude duplicates and subsumed words

Do not return an item twice. Compare after lowercasing, trimming spaces, and converting to dictionary/base form.

If a selected phrase contains a word used with the same meaning, do not select that component separately:

- `in a row` excludes `row`.
- `make an effort to` excludes `effort`.
- `Board of Directors` excludes `board` and `director`.
- `quality control` excludes `control` when both name the same function.

Identical spelling with a genuinely different POS and meaning may be retained only when both forms are independently valuable and unambiguous.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-11 — Passage grounding

Every item must derive from text actually present in the passage. Permitted transformations are inflected verb to base form, plural noun to singular, comparative adjective to dictionary form, and an inflected phrase to its natural dictionary form.

Never add a synonym absent from the passage, a related topic word, an advanced replacement, or an item used only to reach the count.

Valid transformations: `introducing` → `introduce`; `transactions` → `transaction`; `credited` → `credit`; `upgrading` → `upgrade`; `candidates` → `candidate`; `processed manually` → `process manually`.

Passage grounding has higher priority than quantity.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-12 — Base-form rules

Return verbs in the infinitive without `to`: `implemented` → `implement`; `reimbursing` → `reimburse`; `has relocated` → `relocate`.

Return phrases naturally: `was responsible for` → `be responsible for`; `complied with` → `comply with`; `will take effect` → `take effect`.

Return nouns singular unless plural is lexical: `candidates` → `candidate`; `invoices` → `invoice`; `premises` remains `premises`.

Return dictionary adjective/adverb forms: `more efficient` → `efficient`; `manually` remains `manually`.

Preserve particles: `in accordance with`, `on behalf of`, `follow up`, `be delighted to`.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-13 — Allowed single-word system types

The system catalog is authoritative. Output full names, never `N`, `V`, `Adj`, `NP`, `VP`, `PP`, or `AP`.

- `Noun`: single-word noun.
- `Verb`: single-word lexical verb.
- `Adjective`: single-word adjective.
- `Adverb`: single-word adverb.
- `Preposition`: valuable single preposition.
- `Prefix`: productive bound prefix explicitly presented as vocabulary.
- `Suffix`: productive bound suffix explicitly presented as vocabulary.
- `Conjunction`: conjunction with sufficient learning value.
- `Interjection`: interjection with sufficient learning value.

Noun, Verb, Adjective, and Adverb are much more common. Do not force rare types.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-14 — Allowed multi-word system types

- `Noun Phrase`: noun head; example `quality control`.
- `Phrasal Verb`: verb plus particle; example `follow up`.
- `Adjective Phrase`: adjective center; example `free of charge`.
- `Idiom`: fixed non-literal expression; example `in a row` when treated idiomatically.
- `Verb Phrase`: verb center but not a phrasal verb; example `be responsible for`.
- `Prepositional Phrase`: fixed expression beginning with a preposition; example `on behalf of`.
- `Phrase`: fallback only when no specific type applies.

Always choose the most specific allowed system value.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-15 — IPA and Vietnamese meaning

Use British English IPA, enclosed in forward slashes, for the complete item with stress marks. Do not add audio URLs, respellings, syllable notes, or alternatives.

Examples: `streamline` → `/ˈstriːmlaɪn/`; `reimburse` → `/ˌriːɪmˈbɜːs/`; `quality control` → `/ˈkwɒləti kənˈtrəʊl/`; `on behalf of` → `/ɒn bɪˈhɑːf əv/`.

Return one concise Vietnamese meaning matching context. Do not include explanations, English definitions, examples, POS notes, reasons, or unrelated senses.

Examples: `reimburse` → `hoàn trả chi phí`; `candidate` → `ứng viên`; `premises` → `cơ sở; mặt bằng`; `quality control` → `kiểm soát chất lượng`.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-16 — Topic priorities: Human Resources and Finance

Topic lists rank only candidates actually present in the passage.

HR single words: `candidate`, `staffing`, `licensed`, `expertise`, `relocate`, `recruit`, `promote`, `resign`, `supervisor`, `credential`. Phrases: `Board of Directors`, `in a row`, `be delighted to`, `welcome on board`, `make an effort to`, `in search of`, `proven track record`.

Finance single words: `revenue`, `expenditure`, `reimburse`, `invoice`, `fiscal`, `overhead`, `transaction`, `dividend`. Phrases: `quarterly report`, `budget allocation`, `outstanding balance`, `profit margin`, `direct deposit`.

Never add an absent whitelist item.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-17 — Topic priorities: Real Estate and Manufacturing

Topic lists rank only candidates actually present in the passage.

Real Estate single words: `premises`, `renovation`, `tenant`, `maintenance`, `occupancy`, `lease`. Phrases: `lease agreement`, `square footage`, `property management`.

Manufacturing and Shipping single words: `inventory`, `defective`, `warehouse`, `supplier`, `freight`, `shipment`. Phrases: `assembly line`, `quality control`, `lead time`, `comply with`.

Prefer an independent high-value word unless a recognized technical compound or fixed phrase carries the real learning value.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-18 — Topic priorities: Technology and Marketing

Topic lists rank only candidates actually present in the passage.

Technology single words: `compatible`, `upgrade`, `glitch`, `retrieve`, `security`, `troubleshoot`. Phrases: `technical support`, `user-friendly interface`, `troubleshooting guide`, `system maintenance`.

Marketing single words: `campaign`, `broadcast`, `demographic`, `endorse`, `strategy`, `launch`. Phrases: `target audience`, `brand awareness`, `market research`, `launch a product`.

Exclude specific brand, application, product, and feature names.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-19 — Topic priorities: Purchasing and Healthcare

Topic lists rank only candidates actually present in the passage.

Purchasing single words: `procure`, `wholesale`, `discount`, `voucher`, `bulk`, `supplier`. Phrases: `place an order`, `on backorder`, `shipping and handling`, `supplier agreement`.

Healthcare and Insurance single words: `premium`, `prescription`, `practitioner`, `coverage`, `checkup`. Phrases: `insurance policy`, `fill a prescription`, `medical facility`, `health benefits`.

Choose contextual meanings. In insurance, `premium` normally means `phí bảo hiểm`, not `cao cấp`.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-20 — Topic priorities: Banking, Events, and Tourism

Topic lists rank only candidates actually present in the passage.

Banking and Investment single words: `withdraw`, `transaction`, `interest`, `dividend`, `portfolio`. Phrases: `savings account`, `direct deposit`, `investment advisor`.

Events and Tourism single words: `itinerary`, `attendee`, `venue`, `complimentary`, `accommodate`. Phrases: `keynote speaker`, `registration fee`, `cancellation policy`.

Exclude specific bank, hotel, venue, airline, person, city, and product names.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-21 — Candidate ranking procedure

1. Read the passage and identify its business topic.
2. Generate only candidates represented in the passage.
3. Remove proper nouns, elementary words, and basic business words.
4. Convert candidates to dictionary form.
5. Apply the Business Functional Test.
6. Identify necessary fixed phrases, compounds, and phrasal verbs.
7. Remove duplicates and subsumed words.
8. Rank by TOEIC value, usefulness, specificity, B1–C1 level, and topic.
9. Select 8–15 items at approximately 80/20.
10. Assign the most specific system type.
11. Produce British IPA and a contextual Vietnamese meaning.
12. Return only required application fields.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-22 — Golden example: Human Resources

Passage: “The Board of Directors examined numerous candidates. The company sought a licensed specialist with extensive expertise and was delighted to welcome the successful applicant.”

- `Board of Directors` — Noun Phrase — `/ˌbɔːd əv dəˈrektəz/` — `hội đồng quản trị`.
- `examine` — Verb — `/ɪɡˈzæmɪn/` — `xem xét; đánh giá`.
- `candidate` — Noun — `/ˈkændɪdət/` — `ứng viên`.
- `licensed` — Adjective — `/ˈlaɪsnst/` — `được cấp phép`.
- `expertise` — Noun — `/ˌekspɜːˈtiːz/` — `chuyên môn`.
- `be delighted to` — Verb Phrase — `/bi dɪˈlaɪtɪd tə/` — `rất vui được làm gì`.

Exclude any specific person or company name.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-23 — Golden examples: Finance and Manufacturing

Finance passage: “Employees may submit an invoice for approved expenses. The accounting department will reimburse eligible costs by direct deposit.” Strong items: `invoice` — Noun — `hóa đơn`; `reimburse` — Verb — `hoàn trả chi phí`; `eligible` — Adjective — `đủ điều kiện`; `direct deposit` — Noun Phrase — `chuyển khoản trực tiếp`.

Manufacturing passage: “The supplier introduced stricter quality control after several defective components delayed the assembly line.” Strong items: `supplier` — Noun — `nhà cung cấp`; `quality control` — Noun Phrase — `kiểm soát chất lượng`; `defective` — Adjective — `bị lỗi`; `component` — Noun — `linh kiện`; `assembly line` — Noun Phrase — `dây chuyền lắp ráp`.

All items must remain grounded in their passage.

<!-- DIFY_CHUNK_SEPARATOR -->

## CHUNK-24 — Final quality gate

Before returning vocabulary, verify silently:

1. There are 8–15 items unless the workflow applies a stricter policy.
2. Every item is grounded and normalized only by permitted transformations.
3. Proper nouns, elementary words, duplicates, and subsumed words are excluded.
4. The ratio is approximately 80/20 without sacrificing quality.
5. Every POS exactly matches the system catalog.
6. Every item has British IPA enclosed in `/.../`.
7. Every Vietnamese meaning is concise and contextual.
8. No item includes evidence, source position, pillar, reason, confidence, notes, or debug fields.

The workflow prompt, not this KB, is the authoritative machine-readable JSON contract.
