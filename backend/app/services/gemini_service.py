import asyncio
import json

import httpx

from google import genai
from google.genai import types
from google.genai.errors import ClientError, ServerError

from app.core.config import settings
from app.schemas.review import ReviewResult


# ============================================================
# GEMINI CLIENT
# ============================================================

def get_gemini_client() -> genai.Client:
    """
    Create and return a Gemini API client.
    """

    if not settings.GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is not configured."
        )

    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
    )


# ============================================================
# REVIEW PROMPT
# ============================================================

def build_review_prompt(
    review_input: str,
) -> str:
    """
    Build the common code-review prompt.
    """

    return f"""
You are an expert software engineer and
security-focused code reviewer.

Review the following Pull Request changes.

Focus on:

- Security vulnerabilities
- Bugs
- Incorrect logic
- Performance problems
- Code quality issues
- Dangerous or suspicious patterns

Only report issues that are genuinely relevant.

Do not report harmless style preferences
as bugs.

For every finding:

- Use the exact filename provided.
- Use the exact new-file line number.
- Assign an appropriate severity.
- Assign the correct category.
- Give a concise explanation.
- Explain the concrete consequence in `why_it_matters`.
- Give implementation guidance in `recommended_approach`.
- Give specific verification steps in `verification_steps`.
- Provide a practical fix when possible.

If there are no meaningful issues,
return an empty findings list.

Return ONLY valid JSON matching this structure:

{{
    "findings": [
        {{
            "filename": "example.py",
            "line": 10,
            "severity": "high",
            "category": "security",
            "message": "Explain the issue.",
            "why_it_matters": "Explain the concrete risk.",
            "recommended_approach": "Explain the safest implementation approach.",
            "suggestion": "Show the corrected code or exact change when possible.",
            "verification_steps": "Describe relevant tests and checks."
        }}
    ],
    "files_reviewed": 1,
    "lines_reviewed": 10
}}

Pull Request changes:

{review_input}
"""


# ============================================================
# GEMINI REVIEW
# ============================================================

async def review_with_gemini(
    review_input: str,
) -> ReviewResult:
    """
    Review code using Gemini.
    """

    client = get_gemini_client()

    prompt = build_review_prompt(
        review_input
    )

    max_attempts = 4

    for attempt in range(max_attempts):

        try:

            response = (
                await client.aio.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=ReviewResult,
                        temperature=0.1,
                    ),
                )
            )

            if not response.parsed:
                raise RuntimeError(
                    "Gemini returned an empty or invalid "
                    "review response."
                )

            return response.parsed

        # ----------------------------------------------------
        # GEMINI 429
        # ----------------------------------------------------

        except ClientError as exc:

            error_text = str(exc)

            if (
                "429" in error_text
                or "RESOURCE_EXHAUSTED" in error_text
                or "quota" in error_text.lower()
            ):
                print(
                    "Gemini quota exceeded."
                )

                raise RuntimeError(
                    "GEMINI_QUOTA_EXCEEDED"
                ) from exc

            raise

        # ----------------------------------------------------
        # GEMINI 503
        # ----------------------------------------------------

        except ServerError as exc:

            error_text = str(exc)

            if (
                "503" not in error_text
                and "UNAVAILABLE" not in error_text
            ):
                raise

            if attempt == max_attempts - 1:
                raise RuntimeError(
                    "Gemini is currently unavailable "
                    "after multiple attempts."
                ) from exc

            delay = 2 ** attempt

            print(
                "Gemini temporarily unavailable "
                f"(attempt {attempt + 1}/"
                f"{max_attempts}). "
                f"Retrying in {delay} seconds..."
            )

            await asyncio.sleep(delay)


# ============================================================
# OPENROUTER REVIEW
# ============================================================

async def review_with_openrouter(
    review_input: str,
) -> ReviewResult:
    """
    Review code using OpenRouter.
    """

    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not configured."
        )

    prompt = build_review_prompt(
        review_input
    )

    url = (
        "https://openrouter.ai/api/v1/"
        "chat/completions"
    )

    headers = {
        "Authorization": (
            f"Bearer {settings.OPENROUTER_API_KEY}"
        ),
        "Content-Type": "application/json",
        "HTTP-Referer": (
            settings.BACKEND_URL
        ),
        "X-Title": (
            "Kodeistry Code Reviewer"
        ),
    }

    payload = {
        "model": settings.OPENROUTER_MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "temperature": 0.1,
    }

    print(
        "Calling OpenRouter model: "
        f"{settings.OPENROUTER_MODEL}"
    )

    async with httpx.AsyncClient(
        timeout=120.0
    ) as client:

        response = await client.post(
            url,
            headers=headers,
            json=payload,
        )

    # --------------------------------------------------------
    # OpenRouter error
    # --------------------------------------------------------

    if response.status_code != 200:
        raise RuntimeError(
            "OpenRouter request failed: "
            f"{response.status_code}\n"
            f"{response.text}"
        )

    data = response.json()

    # --------------------------------------------------------
    # Extract model response
    # --------------------------------------------------------

    try:

        content = (
            data["choices"][0]["message"]["content"]
        )

    except (
        KeyError,
        IndexError,
        TypeError,
    ) as exc:

        raise RuntimeError(
            "OpenRouter returned an invalid response:\n"
            f"{data}"
        ) from exc

    if not content:
        raise RuntimeError(
            "OpenRouter returned an empty response."
        )

    # --------------------------------------------------------
    # Clean JSON markdown
    # --------------------------------------------------------

    content = content.strip()

    if content.startswith("```json"):
        content = content[
            len("```json"):
        ].strip()

    elif content.startswith("```"):
        content = content[
            len("```"):
        ].strip()

    if content.endswith("```"):
        content = content[
            :-3
        ].strip()

    # --------------------------------------------------------
    # Parse JSON
    # --------------------------------------------------------

    try:

        parsed = json.loads(
            content
        )

    except json.JSONDecodeError as exc:

        raise RuntimeError(
            "OpenRouter returned invalid JSON:\n"
            f"{content}"
        ) from exc

    # --------------------------------------------------------
    # Validate ReviewResult
    # --------------------------------------------------------

    try:

        return ReviewResult.model_validate(
            parsed
        )

    except Exception as exc:

        raise RuntimeError(
            "OpenRouter response does not match "
            "ReviewResult schema:\n"
            f"{parsed}"
        ) from exc


# ============================================================
# MAIN REVIEW FUNCTION
# ============================================================

async def review_code_with_gemini(
    review_input: str,
) -> ReviewResult:
    """
    Main review function.

    PRIMARY:
        Gemini 3 Flash

    FALLBACK:
        OpenRouter Gemma

    Fallback occurs only when Gemini
    returns a quota/rate-limit error.
    """

    try:

        print(
            "Running code review with Gemini: "
            f"{settings.GEMINI_MODEL}"
        )

        return await review_with_gemini(
            review_input
        )

    except RuntimeError as exc:

        if str(exc) != "GEMINI_QUOTA_EXCEEDED":
            raise

        print(
            "Gemini quota exceeded."
        )

        print(
            "Switching to OpenRouter fallback..."
        )

        return await review_with_openrouter(
            review_input
        )
