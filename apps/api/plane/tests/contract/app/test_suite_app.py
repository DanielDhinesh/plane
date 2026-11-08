# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the Stratify suite: teams, workflows, wiki, templates, mail, sheets, bulk edit."""

from datetime import date, timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, IssueLabel, Label, Project, ProjectMember, State, User, WorkspaceMember
from plane.suite.models import (
    ProjectWorkflow,
    WikiPage,
    WikiPageVersion,
    WikiSpace,
    WorkflowTransition,
    WorkspaceMailSettings,
    WorkTeam,
    WorkTeamMember,
    WorkTeamProject,
)

BASE = "/api/suite/workspaces"


@pytest.fixture(autouse=True)
def no_celery(monkeypatch):
    """Never enqueue background jobs from these tests."""
    monkeypatch.setattr("celery.app.task.Task.delay", lambda self, *a, **k: None)


@pytest.fixture
def member_user(db, workspace):
    user = User.objects.create(email="member@stratify.test", username="member_user", first_name="Mia")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return user


@pytest.fixture
def member_client(member_user):
    client = APIClient()
    client.force_authenticate(user=member_user)
    return client


@pytest.fixture
def project(db, workspace, create_user, member_user):
    project = Project.objects.create(name="Apollo", identifier="APL", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
    ProjectMember.objects.create(project=project, member=member_user, role=15, is_active=True)
    return project


@pytest.fixture
def states(project):
    names = [("Todo", "unstarted"), ("Doing", "started"), ("Done", "completed")]
    return {
        name: State.objects.create(name=name, group=group, project=project, workspace=project.workspace, default=i == 0)
        for i, (name, group) in enumerate(names)
    }


def _issue(project, state, name="Item", **kwargs):
    return Issue.objects.create(name=name, project=project, workspace=project.workspace, state=state, **kwargs)


# --------------------------------------------------------------------------- teams


@pytest.mark.contract
class TestTeams:
    @pytest.mark.django_db
    def test_create_team_with_members_and_projects(self, session_client, workspace, create_user, member_user, project):
        response = session_client.post(
            f"{BASE}/{workspace.slug}/teams/",
            {
                "name": "Engineering",
                "identifier": "eng",
                "member_ids": [str(member_user.id)],
                "project_ids": [str(project.id)],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        data = response.data
        assert data["identifier"] == "ENG"
        assert set(data["member_ids"]) == {str(create_user.id), str(member_user.id)}
        assert data["project_ids"] == [str(project.id)]
        team = WorkTeam.objects.get(pk=data["id"])
        assert WorkTeamMember.objects.get(team=team, member=create_user).role == 20

    @pytest.mark.django_db
    def test_duplicate_identifier_rejected(self, session_client, workspace, create_user):
        WorkTeam.objects.create(workspace=workspace, name="Design", identifier="DES", lead=create_user)
        response = session_client.post(
            f"{BASE}/{workspace.slug}/teams/", {"name": "Design 2", "identifier": "DES"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_non_lead_member_cannot_edit_team(self, member_client, workspace, create_user):
        team = WorkTeam.objects.create(workspace=workspace, name="Ops", identifier="OPS", lead=create_user)
        response = member_client.patch(f"{BASE}/{workspace.slug}/teams/{team.id}/", {"name": "Hijacked"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_non_workspace_member_ids_are_ignored(self, session_client, workspace):
        outsider = User.objects.create(email="out@stratify.test", username="outsider")
        response = session_client.post(
            f"{BASE}/{workspace.slug}/teams/",
            {"name": "Sales", "identifier": "SLS", "member_ids": [str(outsider.id)]},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert str(outsider.id) not in response.data["member_ids"]

    @pytest.mark.django_db
    def test_join_and_leave(self, member_client, workspace, create_user, member_user):
        team = WorkTeam.objects.create(workspace=workspace, name="QA", identifier="QA", lead=create_user)
        assert member_client.post(f"{BASE}/{workspace.slug}/teams/{team.id}/membership/").status_code == 200
        assert WorkTeamMember.objects.filter(team=team, member=member_user).exists()
        assert member_client.delete(f"{BASE}/{workspace.slug}/teams/{team.id}/membership/").status_code == 204
        assert not WorkTeamMember.objects.filter(team=team, member=member_user).exists()


# --------------------------------------------------------------------------- workflows


@pytest.mark.contract
class TestWorkflow:
    def _enforce(self, project, states, roles=None):
        ProjectWorkflow.objects.create(project=project, is_enforced=True, admins_bypass=True)
        WorkflowTransition.objects.create(
            project=project, from_state=states["Todo"], to_state=states["Doing"], allowed_roles=roles or []
        )

    def _move(self, client, workspace, project, issue, state):
        return client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/",
            {"state_id": str(state.id)},
            format="json",
        )

    @pytest.mark.django_db
    def test_member_blocked_on_missing_transition(self, member_client, workspace, project, states):
        self._enforce(project, states)
        issue = _issue(project, states["Todo"])
        response = self._move(member_client, workspace, project, issue, states["Done"])
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "WORKFLOW_TRANSITION_NOT_ALLOWED"
        issue.refresh_from_db()
        assert issue.state_id == states["Todo"].id

    @pytest.mark.django_db
    def test_member_allowed_on_defined_transition(self, member_client, workspace, project, states):
        self._enforce(project, states)
        issue = _issue(project, states["Todo"])
        response = self._move(member_client, workspace, project, issue, states["Doing"])
        assert response.status_code == status.HTTP_204_NO_CONTENT
        issue.refresh_from_db()
        assert issue.state_id == states["Doing"].id

    @pytest.mark.django_db
    def test_role_restricted_transition(self, member_client, workspace, project, states):
        self._enforce(project, states, roles=[20])
        issue = _issue(project, states["Todo"])
        assert self._move(member_client, workspace, project, issue, states["Doing"]).status_code == 400

    @pytest.mark.django_db
    def test_admin_bypass(self, session_client, workspace, project, states):
        self._enforce(project, states)
        issue = _issue(project, states["Todo"])
        assert self._move(session_client, workspace, project, issue, states["Done"]).status_code == 204

    @pytest.mark.django_db
    def test_not_enforced_allows_everything(self, member_client, workspace, project, states):
        issue = _issue(project, states["Todo"])
        assert self._move(member_client, workspace, project, issue, states["Done"]).status_code == 204

    @pytest.mark.django_db
    def test_replace_matrix_and_allowed_endpoint(self, session_client, member_client, workspace, project, states):
        url = f"{BASE}/{workspace.slug}/projects/{project.id}/workflow/"
        response = session_client.put(
            url,
            {
                "transitions": [
                    {"from_state": str(states["Todo"].id), "to_state": str(states["Doing"].id)},
                    {"from_state": str(states["Doing"].id), "to_state": str(states["Done"].id)},
                ]
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert len(response.data["transitions"]) == 2
        assert session_client.patch(url, {"is_enforced": True}, format="json").data["workflow"]["is_enforced"]
        allowed = member_client.get(f"{url}allowed/?state_id={states['Todo'].id}").data
        assert allowed["restricted"] is True
        assert set(allowed["state_ids"]) == {str(states["Todo"].id), str(states["Doing"].id)}

    @pytest.mark.django_db
    def test_member_cannot_edit_workflow(self, member_client, workspace, project):
        url = f"{BASE}/{workspace.slug}/projects/{project.id}/workflow/"
        assert member_client.patch(url, {"is_enforced": True}, format="json").status_code == 403


# --------------------------------------------------------------------------- wiki


@pytest.mark.contract
class TestWiki:
    @pytest.mark.django_db
    def test_space_creates_home_page_and_tree(self, session_client, workspace):
        response = session_client.post(
            f"{BASE}/{workspace.slug}/wiki/spaces/", {"name": "Engineering Handbook", "key": "eng"}, format="json"
        )
        assert response.status_code == 201, response.data
        space_id = response.data["id"]
        pages = session_client.get(f"{BASE}/{workspace.slug}/wiki/spaces/{space_id}/pages/").data
        assert len(pages) == 1
        child = session_client.post(
            f"{BASE}/{workspace.slug}/wiki/spaces/{space_id}/pages/",
            {"title": "Onboarding", "parent": pages[0]["id"], "description_html": "<p>Hello <b>team</b></p>"},
            format="json",
        )
        assert child.status_code == 201, child.data
        assert str(child.data["parent"]) == str(pages[0]["id"])

    @pytest.mark.django_db
    def test_page_cannot_be_nested_under_itself(self, session_client, workspace, create_user):
        space = WikiSpace.objects.create(workspace=workspace, name="S", key="S", created_by=create_user)
        parent = WikiPage.objects.create(workspace=workspace, space=space, title="P")
        child = WikiPage.objects.create(workspace=workspace, space=space, title="C", parent=parent)
        response = session_client.patch(
            f"{BASE}/{workspace.slug}/wiki/spaces/{space.id}/pages/{parent.id}/",
            {"parent": str(child.id)},
            format="json",
        )
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_update_snapshots_version_and_restore(self, session_client, workspace, create_user):
        space = WikiSpace.objects.create(workspace=workspace, name="S", key="S", created_by=create_user)
        page = WikiPage.objects.create(workspace=workspace, space=space, title="Policy", description_html="<p>v1</p>")
        url = f"{BASE}/{workspace.slug}/wiki/spaces/{space.id}/pages/{page.id}/"
        assert session_client.patch(url, {"description_html": "<p>v2</p>"}, format="json").status_code == 200
        version = WikiPageVersion.objects.get(page=page)
        assert version.description_html == "<p>v1</p>"
        restored = session_client.post(f"{url}versions/{version.id}/restore/")
        assert restored.status_code == 200
        assert restored.data["description_html"] == "<p>v1</p>"

    @pytest.mark.django_db
    def test_private_space_hidden_from_other_members(self, member_client, workspace, create_user):
        WikiSpace.objects.create(workspace=workspace, name="Secret", key="SEC", access=1, created_by=create_user)
        WikiSpace.objects.create(workspace=workspace, name="Open", key="OPN", access=0, created_by=create_user)
        names = [s["name"] for s in member_client.get(f"{BASE}/{workspace.slug}/wiki/spaces/").data]
        assert names == ["Open"]

    @pytest.mark.django_db
    def test_locked_page_blocks_other_editors(self, member_client, workspace, create_user):
        space = WikiSpace.objects.create(workspace=workspace, name="S", key="S", created_by=create_user)
        page = WikiPage.objects.create(
            workspace=workspace, space=space, title="Locked", owned_by=create_user, is_locked=True
        )
        response = member_client.patch(
            f"{BASE}/{workspace.slug}/wiki/spaces/{space.id}/pages/{page.id}/", {"title": "x"}, format="json"
        )
        assert response.status_code == 423

    @pytest.mark.django_db
    def test_search(self, session_client, workspace, create_user):
        space = WikiSpace.objects.create(workspace=workspace, name="S", key="S", created_by=create_user)
        WikiPage.objects.create(
            workspace=workspace, space=space, title="Release process", description_stripped="how we ship weekly"
        )
        results = session_client.get(f"{BASE}/{workspace.slug}/wiki/search/?q=ship").data
        assert [r["title"] for r in results] == ["Release process"]


# --------------------------------------------------------------------------- templates


@pytest.mark.contract
class TestTemplates:
    @pytest.mark.django_db
    def test_list_templates(self, session_client, workspace):
        data = session_client.get(f"{BASE}/{workspace.slug}/templates/").data
        assert len(data["builtin"]) >= 10
        assert data["custom"] == []

    @pytest.mark.django_db
    def test_create_project_from_template(self, session_client, workspace, create_user):
        response = session_client.post(
            f"{BASE}/{workspace.slug}/templates/create-project/",
            {"template": "agile-scrum", "project": {"name": "Rocket", "identifier": "RKT"}},
            format="json",
        )
        assert response.status_code == 201, response.data
        project = Project.objects.get(identifier="RKT", workspace=workspace)
        assert ProjectMember.objects.filter(project=project, member=create_user, role=20).exists()
        names = set(State.objects.filter(project=project).values_list("name", flat=True))
        assert {"Backlog", "Code Review", "Done"} <= names
        assert State.objects.filter(project=project, default=True).count() == 1
        assert Label.objects.filter(project=project, name="Bug").exists()
        assert Issue.objects.filter(project=project).count() == response.data["summary"]["work_items"] > 0
        assert WorkflowTransition.objects.filter(project=project).count() == response.data["summary"]["transitions"] > 0

    @pytest.mark.django_db
    def test_save_project_as_template_and_reuse(self, session_client, workspace, project, states):
        saved = session_client.post(
            f"{BASE}/{workspace.slug}/templates/custom/",
            {"project_id": str(project.id), "name": "Our flow"},
            format="json",
        )
        assert saved.status_code == 201, saved.data
        created = session_client.post(
            f"{BASE}/{workspace.slug}/templates/create-project/",
            {"template": saved.data["key"], "project": {"name": "Clone", "identifier": "CLN"}},
            format="json",
        )
        assert created.status_code == 201, created.data
        clone = Project.objects.get(identifier="CLN", workspace=workspace)
        assert set(State.objects.filter(project=clone).values_list("name", flat=True)) == {"Todo", "Doing", "Done"}

    @pytest.mark.django_db
    def test_unknown_template_404(self, session_client, workspace):
        response = session_client.post(
            f"{BASE}/{workspace.slug}/templates/create-project/",
            {"template": "nope", "project": {"name": "X", "identifier": "XX"}},
            format="json",
        )
        assert response.status_code == 404


# --------------------------------------------------------------------------- mail


@pytest.mark.contract
class TestMailSettings:
    @pytest.mark.django_db
    def test_admin_only(self, member_client, workspace):
        assert member_client.get(f"{BASE}/{workspace.slug}/mail-settings/").status_code == 403

    @pytest.mark.django_db
    def test_password_is_write_only_and_encrypted(self, session_client, workspace):
        response = session_client.patch(
            f"{BASE}/{workspace.slug}/mail-settings/",
            {
                "is_enabled": True,
                "host": "smtp.example.com",
                "port": 587,
                "username": "bot",
                "password": "s3cret",
                "from_email": "Stratify <bot@example.com>",
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert "password" not in response.data
        assert response.data["has_password"] is True
        stored = WorkspaceMailSettings.objects.get(workspace=workspace)
        assert stored.password_encrypted and "s3cret" not in stored.password_encrypted

    @pytest.mark.django_db
    def test_tls_and_ssl_together_rejected(self, session_client, workspace):
        response = session_client.patch(
            f"{BASE}/{workspace.slug}/mail-settings/", {"use_tls": True, "use_ssl": True}, format="json"
        )
        assert response.status_code == 400

    @pytest.mark.django_db
    def test_send_test_email(self, session_client, workspace):
        WorkspaceMailSettings.objects.create(
            workspace=workspace, host="smtp.example.com", from_email="bot@example.com", use_tls=False
        )
        response = session_client.post(
            f"{BASE}/{workspace.slug}/mail-settings/test/", {"to": "ops@example.com"}, format="json"
        )
        assert response.status_code == 200, response.data
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["ops@example.com"]
        assert WorkspaceMailSettings.objects.get(workspace=workspace).last_test_ok is True

    @pytest.mark.django_db
    def test_workspace_config_overrides_instance(self, workspace):
        from plane.suite.services.mail import get_workspace_email_configuration, is_event_enabled

        settings_obj = WorkspaceMailSettings.objects.create(
            workspace=workspace,
            is_enabled=True,
            host="mail.acme.test",
            port=2525,
            from_email="pm@acme.test",
            notify_invitations=False,
        )
        config = get_workspace_email_configuration(workspace.id)
        assert config[0] == "mail.acme.test" and config[3] == "2525" and config[6] == "pm@acme.test"
        assert is_event_enabled(workspace.id, "notify_invitations") is False
        settings_obj.is_enabled = False
        settings_obj.save()
        assert get_workspace_email_configuration(workspace.id)[0] != "mail.acme.test"


# --------------------------------------------------------------------------- sheets + bulk


@pytest.mark.contract
class TestSheets:
    @pytest.mark.django_db
    def test_filters(self, session_client, workspace, create_user, project, states):
        other = Project.objects.create(name="Zeus", identifier="ZEU", workspace=workspace)
        ProjectMember.objects.create(project=other, member=create_user, role=20, is_active=True)
        other_state = State.objects.create(name="Open", group="unstarted", project=other, workspace=workspace)
        bug = Label.objects.create(name="Bug", project=project, workspace=workspace)
        a = _issue(
            project, states["Todo"], "Crash on login", priority="urgent", target_date=date.today() - timedelta(days=2)
        )
        _issue(project, states["Done"], "Shipped thing", priority="low")
        _issue(other, other_state, "Other project item", priority="high")
        IssueLabel.objects.create(issue=a, label=bug, project=project, workspace=workspace)
        team = WorkTeam.objects.create(workspace=workspace, name="Core", identifier="CORE", lead=create_user)
        WorkTeamProject.objects.create(team=team, project=other)

        url = f"{BASE}/{workspace.slug}/sheets/"
        assert session_client.get(url).data["total"] == 3
        assert [r["name"] for r in session_client.get(f"{url}?label={bug.id}").data["results"]] == ["Crash on login"]
        assert [r["name"] for r in session_client.get(f"{url}?team={team.id}").data["results"]] == [
            "Other project item"
        ]
        assert session_client.get(f"{url}?priority=urgent,high").data["total"] == 2
        assert session_client.get(f"{url}?overdue=true").data["total"] == 1
        assert session_client.get(f"{url}?state_group=completed").data["total"] == 1
        assert session_client.get(f"{url}?search=APL-{a.sequence_id}").data["results"][0]["id"] == a.id
        ordered = session_client.get(f"{url}?order_by=priority").data["results"]
        assert ordered[0]["priority"] == "urgent"
        row = session_client.get(f"{url}?label={bug.id}").data["results"][0]
        assert row["label_ids"] == [str(bug.id)] and row["project_identifier"] == "APL"

    @pytest.mark.django_db
    def test_guest_sees_only_own_items(self, workspace, project, states, create_user):
        guest = User.objects.create(email="guest@stratify.test", username="guest_user")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProjectMember.objects.create(project=project, member=guest, role=5, is_active=True)
        _issue(project, states["Todo"], "Admin item")
        own = _issue(project, states["Todo"], "Guest item")
        Issue.objects.filter(pk=own.pk).update(created_by=guest)
        client = APIClient()
        client.force_authenticate(user=guest)
        names = [r["name"] for r in client.get(f"{BASE}/{workspace.slug}/sheets/").data["results"]]
        assert names == ["Guest item"]

    @pytest.mark.django_db
    def test_csv_export_and_meta(self, session_client, workspace, project, states):
        _issue(project, states["Todo"], "Exported item")
        response = session_client.get(f"{BASE}/{workspace.slug}/sheets/?export=csv")
        assert response.status_code == 200
        assert response["Content-Type"].startswith("text/csv")
        assert "Exported item" in response.content.decode()
        meta = session_client.get(f"{BASE}/{workspace.slug}/sheets/meta/").data
        assert {p["identifier"] for p in meta["projects"]} == {"APL"}
        assert len(meta["states"]) == 3

    @pytest.mark.django_db
    def test_bulk_update(self, member_client, workspace, project, states, member_user):
        bug = Label.objects.create(name="Bug", project=project, workspace=workspace)
        items = [_issue(project, states["Todo"], f"Item {i}") for i in range(3)]
        response = member_client.post(
            f"{BASE}/{workspace.slug}/work-items/bulk-update/",
            {
                "issue_ids": [str(i.id) for i in items],
                "properties": {
                    "priority": "high",
                    "add_label_ids": [str(bug.id)],
                    "add_assignee_ids": [str(member_user.id)],
                },
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        assert len(response.data["updated"]) == 3 and response.data["failed"] == []
        for issue in items:
            issue.refresh_from_db()
            assert issue.priority == "high"
            assert list(issue.labels.values_list("id", flat=True)) == [bug.id]
            assert list(issue.assignees.values_list("id", flat=True)) == [member_user.id]

    @pytest.mark.django_db
    def test_bulk_update_respects_workflow(self, member_client, workspace, project, states):
        ProjectWorkflow.objects.create(project=project, is_enforced=True)
        issue = _issue(project, states["Todo"])
        response = member_client.post(
            f"{BASE}/{workspace.slug}/work-items/bulk-update/",
            {"issue_ids": [str(issue.id)], "properties": {"state_id": str(states["Done"].id)}},
            format="json",
        )
        assert response.data["updated"] == []
        assert len(response.data["failed"]) == 1
        issue.refresh_from_db()
        assert issue.state_id == states["Todo"].id


@pytest.mark.contract
class TestNavigationPreferences:
    @pytest.mark.django_db
    def test_new_suite_items_are_pinned_by_default(self, session_client, workspace):
        prefs = session_client.get(f"/api/workspaces/{workspace.slug}/sidebar-preferences/").data
        for key in ("teams", "wiki", "sheets", "templates"):
            assert prefs[key]["is_pinned"] is True


@pytest.mark.contract
class TestActiveCycles:
    @pytest.mark.django_db
    def test_lists_running_cycles_with_progress(self, session_client, workspace, project, states, create_user):
        from plane.db.models import Cycle, CycleIssue

        now = timezone.now()
        running = Cycle.objects.create(
            name="Sprint 7",
            owned_by=create_user,
            project=project,
            workspace=workspace,
            start_date=now - timedelta(days=3),
            end_date=now + timedelta(days=4),
        )
        Cycle.objects.create(
            name="Old sprint",
            owned_by=create_user,
            project=project,
            workspace=workspace,
            start_date=now - timedelta(days=30),
            end_date=now - timedelta(days=16),
        )
        for state in (states["Todo"], states["Done"]):
            item = _issue(project, state)
            CycleIssue.objects.create(cycle=running, issue=item, project=project, workspace=workspace)
        data = session_client.get(f"{BASE}/{workspace.slug}/active-cycles/").data
        assert [c["name"] for c in data] == ["Sprint 7"]
        assert data[0]["total"] == 2 and data[0]["progress"] == 50
