import httpx

from app.github.auth import get_installation_access_token


GITHUB_API_URL = "https://api.github.com"


class GitHubClient:
    """
    Client for interacting with GitHub API
    using a GitHub App installation token.
    """

    @staticmethod
    def _headers(
        access_token: str,
    ) -> dict:
        """
        Common GitHub API headers.
        """

        return {
            "Authorization": ("Bearer " + access_token),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def list_installation_repositories(
        self,
        installation_id: int,
    ) -> list[dict]:
        access_token = await get_installation_access_token(installation_id)
        repositories: list[dict] = []
        page = 1

        async with httpx.AsyncClient() as client:
            while True:
                response = await client.get(
                    f"{GITHUB_API_URL}/installation/repositories",
                    headers=self._headers(access_token),
                    params={"per_page": 100, "page": page},
                )
                if response.status_code != 200:
                    raise RuntimeError(
                        "Failed to fetch GitHub installation repositories: "
                        f"{response.status_code} {response.text}"
                    )
                batch = response.json().get("repositories", [])
                repositories.extend(batch)
                if len(batch) < 100:
                    return repositories
                page += 1

    # ========================================================
    # REPOSITORY
    # ========================================================

    async def get_repository(
        self,
        installation_id: int,
        owner: str,
        repo: str,
    ) -> dict:
        """
        Get repository information.
        """

        access_token = (
            await get_installation_access_token(
                installation_id
            )
        )

        url = (
            f"{GITHUB_API_URL}/repos/"
            f"{owner}/{repo}"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=self._headers(access_token),
            )

        if response.status_code != 200:
            raise RuntimeError(
                "Failed to fetch GitHub repository: "
                f"{response.status_code} "
                f"{response.text}"
            )

        return response.json()

    # ========================================================
    # PULL REQUEST
    # ========================================================

    async def get_pull_request(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pull_number: int,
    ) -> dict:
        """
        Get Pull Request details.
        """

        access_token = (
            await get_installation_access_token(
                installation_id
            )
        )

        url = (
            f"{GITHUB_API_URL}/repos/"
            f"{owner}/{repo}/pulls/"
            f"{pull_number}"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=self._headers(access_token),
            )

        if response.status_code != 200:
            raise RuntimeError(
                "Failed to fetch Pull Request: "
                f"{response.status_code} "
                f"{response.text}"
            )

        return response.json()

    # ========================================================
    # PULL REQUEST FILES
    # ========================================================

    async def get_pull_request_files(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pull_number: int,
    ) -> list[dict]:
        """
        Get files changed in a Pull Request.
        """

        access_token = (
            await get_installation_access_token(
                installation_id
            )
        )

        url = (
            f"{GITHUB_API_URL}/repos/"
            f"{owner}/{repo}/pulls/"
            f"{pull_number}/files"
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=self._headers(access_token),
            )

        if response.status_code != 200:
            raise RuntimeError(
                "Failed to fetch Pull Request files: "
                f"{response.status_code} "
                f"{response.text}"
            )

        return response.json()

    # ========================================================
    # PULL REQUEST HEAD SHA
    # ========================================================

    async def get_pull_request_commit_sha(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pull_number: int,
    ) -> str:
        """
        Get the current HEAD commit SHA of a Pull Request.
        """

        pull_request = await self.get_pull_request(
            installation_id=installation_id,
            owner=owner,
            repo=repo,
            pull_number=pull_number,
        )

        head_sha = (
            pull_request
            .get("head", {})
            .get("sha")
        )

        if not head_sha:
            raise RuntimeError(
                "Pull Request HEAD commit SHA not found."
            )

        return head_sha

    # ========================================================
    # CREATE PULL REQUEST REVIEW
    # ========================================================

    async def create_pull_request_review(
        self,
        installation_id: int,
        owner: str,
        repo: str,
        pull_number: int,
        commit_id: str,
        comments: list[dict],
        review_body: str,
    ) -> dict:
        """
        Create and immediately submit a Pull Request review
        with inline comments.
        """

        access_token = (
            await get_installation_access_token(
                installation_id
            )
        )

        url = (
            f"{GITHUB_API_URL}/repos/"
            f"{owner}/{repo}/pulls/"
            f"{pull_number}/reviews"
        )

        payload = {
            "commit_id": commit_id,
            "body": review_body,
            "event": "COMMENT",
            "comments": comments,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=self._headers(access_token),
                json=payload,
            )

        if response.status_code != 200:
            raise RuntimeError(
                "Failed to create Pull Request review: "
                f"{response.status_code} "
                f"{response.text}"
            )

        return response.json()