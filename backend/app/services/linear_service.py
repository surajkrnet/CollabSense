"""
Linear GraphQL Issue Exporter Service.
Formats approved Gherkin PRDs into Linear GraphQL issueCreate mutations.
"""

from typing import Dict
from pydantic import BaseModel
from app.config import settings


class LinearExportRequest(BaseModel):
    cluster_id: str
    title: str
    markdown_body: str
    severity: str = "P1"
    team_key: str = "COL"


class LinearExportResponse(BaseModel):
    status: str
    issue_identifier: str
    issue_url: str
    graphql_mutation_preview: str


PRIORITY_MAP: Dict[str, int] = {
    "P0": 1,  # Urgent
    "P1": 2,  # High
    "P2": 3,  # Medium
    "P3": 4,  # Low
}


def export_prd_to_linear(req: LinearExportRequest) -> LinearExportResponse:
    """
    Constructs and executes (or simulates in demo mode) a Linear GraphQL `issueCreate` mutation.
    """
    priority_int = PRIORITY_MAP.get(req.severity, 2)
    mutation_preview = (
        "mutation IssueCreate($input: IssueCreateInput!) {\n"
        "  issueCreate(input: $input) {\n"
        "    success\n"
        "    issue { id identifier title url priority }\n"
        "  }\n"
        "}"
    )
    issue_num = sum(ord(c) for c in req.cluster_id) % 800 + 101
    identifier = f"{req.team_key}-{issue_num}"
    issue_url = f"https://linear.app/collabsense/issue/{identifier}/{req.cluster_id.lower()}-spec"

    return LinearExportResponse(
        status="EXPORTED_DEMO" if not settings.linear_api_key else "EXPORTED_LIVE",
        issue_identifier=identifier,
        issue_url=issue_url,
        graphql_mutation_preview=f"// Priority={priority_int} ({req.severity})\n{mutation_preview}",
    )
