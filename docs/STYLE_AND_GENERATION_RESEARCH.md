# Style, screen, and final-generation research

Status: MVP recommendation
Research date: 2026-08-08
Scope: art direction, asset availability/licensing, the three supplied screen concepts, and the final image/video generation handoff. This document supplements `ASSET_PIPELINE_RESEARCH.md`; it does not repeat its layer manifest or renderer specification.

## Decision

Ship a **warm, stylized 2D/painterly Murti**, not a photoreal idol and not a highly rendered “Pixar-like” 3D character. Use the **screen 3 hierarchy**—large Murti, one compact vertical category rail, and one horizontal variant carousel—but make variants tap/swipe selections rather than drag-to-apply.

The festival MVP should customize the lowest-risk, highest-payoff slots first: **Crown, Garland, Drape/Outfit, Seat, and Scene**. Keep pose and anatomy baked into the base. Eyes, ears, and trunk can remain a later face-kit experiment after seam and cultural review.

At the end, the Generate action should send a **flattened deterministic composite plus a structured prompt/spec** to image generation. The prompt alone is not an adequate representation of the user's choices. Offer a high-quality still first. Treat video as a later/experimental output because the current official Sora API models are marked Legacy and rendering is asynchronous.

## Why stylized is the easier credible product

| Concern | Stylized 2D/painterly | Photorealistic |
| --- | --- | --- |
| Layer seams | Outline, simplified light, and deliberate overlap can conceal joins. | Skin, polished metal, flowers, cloth, contact shadows, reflections, and depth-of-field reveal every mismatch. |
| Variant creation | An illustrator can redraw a crown/garland over one locked master and match a finite palette. | Every replacement must match camera, lens, perspective, material response, light direction, reflected colour, shadow softness, and occlusion. |
| Anatomy | Controlled shapes read coherently even with limited detail. | Eyes, ears, and trunk enter uncanny territory quickly; trunk swaps cross tusks, face, jewellery, hands, and belly. |
| Catalogue consistency | One artist and a style sheet can hold the pack together. | Stock or AI images that look individually plausible still fail as interchangeable parts. |
| Phone readability | Strong silhouettes and colour blocks survive at thumbnail size. | Fine ornament and low-contrast material differences collapse in small swatches. |
| Cultural review | Easier to lock approved iconography and expression in one master. | Generative or stock variations are more likely to introduce small but meaningful anatomical/iconographic drift. |

This is a recommendation for **restrained illustration**, not comic distortion. Keep the expression serene, proportions respectful, and ornament festive. Screen 1's soft toy-like finish is directionally easier than screens 2/3's realism, but its complex volumetric lighting is still more expensive to keep consistent than a painterly 2D master.

## What asset availability actually solves

There is abundant Ganesha source material but little evidence of production-ready interchangeable packs:

- Adobe Stock currently surfaces tens of thousands of “Ganesha vector” results, and individual listings can include editable AI/EPS plus JPEG. This is useful for **market/style research or a legally cleared starting illustration**, not evidence that the files share one pose, sockets, anchors, lighting, or layer contract. ([Adobe Stock Ganesha vector search](https://stock.adobe.com/in/search/images?k=ganesha+vector), [example AI/EPS listing](https://stock.adobe.com/images/hindu-lord-ganesha/115994590))
- Freepik listings similarly show many complete cartoon/vector Ganesha illustrations, often as a single finished composition; some are explicitly AI-generated. They do not constitute an aligned crown/garland/outfit pack. ([example Freepik complete illustration](https://www.freepik.com/premium-vector/colorful-illustration-hindu-god-ganesha-he-is-depicted-with-large-head-trunk-four-arms-he-is-wearing-crown-garland-flowers_351988151.htm), [example cartoon illustration](https://www.freepik.com/premium-vector/cartoon-ganesha-illustration-red-attire-with-gold-crown-ornaments_419892773.htm))
- Wikimedia Commons has many Ganesha artworks and photographs, but each file carries its own license. These are valuable iconographic/historical references; they are not a unified editable product pack. ([Wikimedia Commons Ganesha category](https://commons.wikimedia.org/wiki/Category:Ganesha))
- OpenGameArt permits commercial use under several licenses, but its own FAQ notes that some CC licences conflict with DRM-bearing distribution and that attribution/share-alike terms vary. That makes “free” assets a file-by-file legal and operational review for an iOS app. ([OpenGameArt licensing FAQ](https://opengameart.org/node/5571))

The licensing risk is especially relevant because the art is the app's main value. Adobe's current terms allow modification under a Standard License and exempt mobile-app display from an audience cap, but the same Standard License prohibits incorporation into an electronic template or design-template application. Adobe's Extended License expressly adds template/design-template uses. This app is close enough to that category that the team should not assume a Standard stock license is sufficient; obtain an Extended licence or written clearance, or commission original art with explicit app, modification, generation-input, marketing, and derivative-output rights. ([Adobe Stock terms, sections 3.1–3.3](https://www.adobe.com/go/stockterms))

**Practical conclusion:** stock availability reduces mood-board time, not layer-production time. The fastest dependable route is one commissioned stylized master and a small pack drawn over it. Do not assemble the production Murti from unrelated marketplace PNGs.

## Screen concepts compared

| Concept | Strength | Cost/risk | MVP verdict |
| --- | --- | --- | --- |
| Screen 1: central Murti with four stacked horizontal trays | Every choice is visible; cheerful and immediately understandable. | Four trays consume most of the portrait screen, shrink the Murti, and require dense tiny targets. Curved/perspective trays, glow, selection effects, and simultaneous scrolling add polish work. | Good marketing composition, not the first shippable editor. |
| Screen 2: immersive festival scene with horizontal bands | Strong emotional/festival impact; larger Murti than screen 1. | Highest visual noise and GPU/art burden. Swatches compete with the background, bands obscure the artwork, and the full-bleed realism magnifies asset mismatches. | Avoid for MVP. Use this mood for the generated share image, not the editing UI. |
| Screen 3: large Murti, right category rail, bottom scene carousel | Clearest hierarchy; Murti remains the focus; categories and variants occupy separate axes; background changes are naturally previewable. | A literal drag-to-dress cloth is expensive and ambiguous. The rail must remain narrow enough for small iPhones, and labels need accessible type/targets. | **Recommended foundation.** Tap a category, then swipe/tap its options in the bottom carousel. |

Recommended single-screen behavior:

1. Keep the Murti fixed and large in the upper/central canvas.
2. Use a narrow vertical rail for five category icons/labels: Crown, Garland, Outfit, Seat, Scene.
3. The active category owns one horizontal bottom carousel; do not show five simultaneous rows.
4. A tap updates the deterministic layered preview immediately; horizontal swipe moves between options.
5. Keep Undo near the preview and one clear **Generate** action at the bottom edge. Avoid “Pop!”, sparkles, fake fingers, perspective trays, and decorative glow as persistent controls.
6. Generate should open a small output choice sheet: **Festival image** now; **Short video** only when account/model availability and waiting-state UX have been proven.

## Final image-generation handoff

Use `gpt-image-2` with the user's flattened preview as the primary image input. Official OpenAI documentation describes it as the current high-quality image generation/editing model, with image input/output and automatic high-fidelity processing of image inputs. It accepts one or more reference images, supports configurable size/quality, and includes portrait outputs up to 2160×3840 within documented constraints. ([GPT Image 2 model](https://developers.openai.com/api/docs/models/gpt-image-2), [image generation guide](https://developers.openai.com/api/docs/guides/image-generation))

Request contract:

```text
Input image 1: exact flattened Murti composition exported by the app
Input image 2 (optional): approved art-direction/style reference owned by the app
Structured spec: baseMurtiID + selected variant IDs + human-readable labels
Prompt: preserve pose, anatomy, mudras, expression, crown/garland/outfit/seat choices;
        improve finish, material detail, lighting, and festive scene;
        no text, no extra limbs, no changed trunk direction, no changed held objects
Output: portrait, high quality, opaque background
```

The deterministic composite is the source of truth; the structured selection list helps the prompt name what must be preserved. Save both with the generation record so an output can be reproduced/audited at the product level even though the model output itself is not pixel-deterministic.

Important constraints:

- `gpt-image-2` currently does **not** support transparent output backgrounds, which is fine for the final share image but confirms it should not be used to manufacture runtime layers. ([official output options](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output))
- Masks are prompt guidance and may not follow their exact shape, so an image edit cannot be expected to preserve every edge perfectly. ([official mask guidance](https://developers.openai.com/api/docs/guides/image-generation#edit-an-image-using-a-mask))
- Official docs warn that complex image requests can take up to two minutes and that character consistency can still vary. The UI therefore needs a cancellable generation state, clear progress language, and a retry that keeps the same design spec. ([official limitations](https://developers.openai.com/api/docs/guides/image-generation#limitations))
- Current documented output-only cost for a 1024×1536 high-quality GPT Image 2 image is $0.165, before input image/text tokens; pricing should be checked again before launch. ([official cost table](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency))

## Video: feasible, but not the festival MVP dependency

The official Videos API can use a PNG/JPEG/WebP image reference as the **first frame**, plus a motion prompt. That is the correct handoff: first generate/approve the still, then submit that still with subtle motion such as lamp flicker, drifting petals, fabric movement, and a slow camera push. Avoid asking the model to change the deity's pose or perform complex limb motion. ([OpenAI video image-reference guide](https://developers.openai.com/api/docs/guides/video-generation#use-image-references))

However:

- The current official model pages mark `sora-2` and `sora-2-pro` as **Legacy**, with older snapshots deprecated. Do not make the launch promise depend on these model IDs without confirming account access and replacement guidance immediately before implementation. ([Sora 2 model](https://developers.openai.com/api/docs/models/sora-2), [Sora 2 Pro model](https://developers.openai.com/api/docs/models/sora-2-pro))
- Video generation is asynchronous: create a job, then poll or receive a webhook; official docs say a render can take several minutes. The app needs a background job record and a “notify me when ready” experience rather than a blocking spinner. ([official asynchronous workflow](https://developers.openai.com/api/docs/guides/video-generation#generate-a-video))
- Sora 2 Pro supports higher-resolution portrait output and costs more per second than Sora 2. This is appropriate only as an explicitly priced/premium output after still generation succeeds reliably. ([Sora 2 Pro model](https://developers.openai.com/api/docs/models/sora-2-pro))

## Smallest credible festival scope

- One respectful stylized seated Base Murti.
- Five slots: Crown, Garland, Outfit/Drape, Seat, Scene.
- Three options per slot (15 variants) authored over the same master.
- Screen 3 hierarchy with tap/swipe selection, immediate local preview, Undo, and Generate.
- One high-quality still output from the flattened preview + structured spec.
- No independent eye/ear/trunk swaps, drag-to-dress, curved multi-row trays, or launch-critical video.

This scope preserves the product's joyful customization promise while concentrating production time on the two things users will notice most: a coherent Murti and a beautiful final festival image.
