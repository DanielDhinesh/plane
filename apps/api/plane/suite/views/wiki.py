# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Knowledge base (Confluence-style): spaces containing a tree of pages with version history."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace, WorkspaceMember
from plane.suite.models import WikiPage, WikiPageVersion, WikiSpace, WikiSpaceAccess
from plane.suite.serializers import (
    WikiPageListSerializer,
    WikiPageSerializer,
    WikiPageVersionSerializer,
    WikiSpaceSerializer,
)

MEMBER_ROLES = [ROLE.ADMIN, ROLE.MEMBER]
VERSION_INTERVAL = timedelta(minutes=5)
MAX_VERSIONS = 100


def _is_admin(slug, user):
    return WorkspaceMember.objects.filter(
        workspace__slug=slug, member=user, role=ROLE.ADMIN.value, is_active=True
    ).exists()


def accessible_spaces(slug, user):
    spaces = WikiSpace.objects.filter(workspace__slug=slug)
    if _is_admin(slug, user):
        return spaces
    return spaces.filter(Q(access=WikiSpaceAccess.WORKSPACE) | Q(members=user) | Q(created_by=user)).distinct()


def _space_or_404(slug, user, space_id):
    return accessible_spaces(slug, user).get(pk=space_id)


def _can_admin_space(slug, user, space):
    return space.created_by_id == user.id or _is_admin(slug, user)


def _can_edit_page(slug, user, page):
    if not page.is_locked:
        return True
    return page.owned_by_id == user.id or _is_admin(slug, user)


def _descendant_ids(page):
    ids, frontier = [], [page.id]
    while frontier:
        children = list(WikiPage.objects.filter(parent_id__in=frontier).values_list("id", flat=True))
        ids.extend(children)
        frontier = children
    return ids


def _snapshot(page, user, force=False):
    last = page.versions.order_by("-created_at").first()
    if not force and last and timezone.now() - last.created_at < VERSION_INTERVAL:
        return
    if last and last.description_html == page.description_html and last.title == page.title:
        return
    WikiPageVersion.objects.create(page=page, title=page.title, description_html=page.description_html, created_by=user)
    stale = page.versions.order_by("-created_at").values_list("id", flat=True)[MAX_VERSIONS:]
    WikiPageVersion.objects.filter(id__in=list(stale)).delete(soft=False)


class WikiSpaceEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def get(self, request, slug, space_id=None):
        spaces = accessible_spaces(slug, request.user).annotate(
            page_count=Count("pages", filter=Q(pages__deleted_at__isnull=True, pages__archived_at__isnull=True))
        )
        if space_id:
            return Response(WikiSpaceSerializer(spaces.get(pk=space_id)).data)
        if request.GET.get("archived") not in ("true", "1"):
            spaces = spaces.filter(archived_at__isnull=True)
        return Response(WikiSpaceSerializer(spaces.prefetch_related("members"), many=True).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WikiSpaceSerializer(data=request.data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            space = serializer.save(workspace=workspace)
            space.members.add(request.user)
            member_ids = request.data.get("member_ids") or []
            if member_ids:
                valid = WorkspaceMember.objects.filter(
                    workspace=workspace, member_id__in=member_ids, is_active=True
                ).values_list("member_id", flat=True)
                space.members.add(*valid)
            WikiPage.objects.create(
                workspace=workspace,
                space=space,
                title=f"{space.name} home",
                description_html=f"<h1>Welcome to {space.name}</h1><p>{space.description or 'Start writing here.'}</p>",
                owned_by=request.user,
                created_by=request.user,
            )
        return Response(WikiSpaceSerializer(space).data, status=status.HTTP_201_CREATED)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def patch(self, request, slug, space_id):
        space = _space_or_404(slug, request.user, space_id)
        if not _can_admin_space(slug, request.user, space):
            return Response({"error": "Only the space owner or a workspace admin can edit this space."}, status=403)
        serializer = WikiSpaceSerializer(
            space, data=request.data, partial=True, context={"workspace_id": space.workspace_id}
        )
        serializer.is_valid(raise_exception=True)
        space = serializer.save()
        if "member_ids" in request.data:
            valid = WorkspaceMember.objects.filter(
                workspace_id=space.workspace_id, member_id__in=request.data.get("member_ids") or [], is_active=True
            ).values_list("member_id", flat=True)
            space.members.set(list(valid) + [space.created_by_id] if space.created_by_id else list(valid))
        if "archived" in request.data:
            space.archived_at = timezone.now() if request.data.get("archived") else None
            space.save(update_fields=["archived_at", "updated_at"])
        return Response(WikiSpaceSerializer(space).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def delete(self, request, slug, space_id):
        space = _space_or_404(slug, request.user, space_id)
        if not _can_admin_space(slug, request.user, space):
            return Response({"error": "Only the space owner or a workspace admin can delete this space."}, status=403)
        WikiPage.objects.filter(space=space).delete()
        space.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WikiPageEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def get(self, request, slug, space_id, page_id=None):
        space = _space_or_404(slug, request.user, space_id)
        if page_id:
            page = WikiPage.objects.get(space=space, pk=page_id)
            return Response(WikiPageSerializer(page).data)
        pages = WikiPage.objects.filter(space=space)
        if request.GET.get("archived") in ("true", "1"):
            pages = pages.filter(archived_at__isnull=False)
        else:
            pages = pages.filter(archived_at__isnull=True)
        return Response(WikiPageListSerializer(pages, many=True).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def post(self, request, slug, space_id):
        space = _space_or_404(slug, request.user, space_id)
        serializer = WikiPageSerializer(data=request.data, context={"space_id": space.id})
        serializer.is_valid(raise_exception=True)
        html = serializer.validated_data.get("description_html", "<p></p>")
        page = serializer.save(
            workspace_id=space.workspace_id,
            space=space,
            owned_by=request.user,
            description_stripped=strip_tags(html)[:100000],
        )
        return Response(WikiPageSerializer(page).data, status=status.HTTP_201_CREATED)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def patch(self, request, slug, space_id, page_id):
        space = _space_or_404(slug, request.user, space_id)
        page = WikiPage.objects.get(space=space, pk=page_id)
        data = dict(request.data)
        if "is_locked" in data and not (page.owned_by_id == request.user.id or _is_admin(slug, request.user)):
            return Response({"error": "Only the page owner or an admin can lock pages."}, status=403)
        content_change = "description_html" in data or "title" in data
        if content_change and not _can_edit_page(slug, request.user, page):
            return Response({"error": "This page is locked."}, status=status.HTTP_423_LOCKED)
        archive = data.pop("archived", None)
        if content_change:
            _snapshot(page, request.user)
        serializer = WikiPageSerializer(page, data=data, partial=True, context={"space_id": space.id})
        serializer.is_valid(raise_exception=True)
        extra = {}
        if "description_html" in serializer.validated_data:
            extra["description_stripped"] = strip_tags(serializer.validated_data["description_html"])[:100000]
        page = serializer.save(**extra)
        if archive is not None:
            when = timezone.now() if archive else None
            ids = [page.id] + _descendant_ids(page)
            WikiPage.objects.filter(id__in=ids).update(archived_at=when)
            page.refresh_from_db()
        return Response(WikiPageSerializer(page).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def delete(self, request, slug, space_id, page_id):
        space = _space_or_404(slug, request.user, space_id)
        page = WikiPage.objects.get(space=space, pk=page_id)
        if not _can_edit_page(slug, request.user, page):
            return Response({"error": "This page is locked."}, status=status.HTTP_423_LOCKED)
        WikiPage.objects.filter(id__in=[page.id] + _descendant_ids(page)).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WikiPageVersionEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def get(self, request, slug, space_id, page_id):
        space = _space_or_404(slug, request.user, space_id)
        page = WikiPage.objects.get(space=space, pk=page_id)
        return Response(WikiPageVersionSerializer(page.versions.all()[:MAX_VERSIONS], many=True).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def post(self, request, slug, space_id, page_id, version_id):
        """Restore a version (the current content is saved as a version first)."""
        space = _space_or_404(slug, request.user, space_id)
        page = WikiPage.objects.get(space=space, pk=page_id)
        if not _can_edit_page(slug, request.user, page):
            return Response({"error": "This page is locked."}, status=status.HTTP_423_LOCKED)
        version = page.versions.get(pk=version_id)
        _snapshot(page, request.user, force=True)
        page.title = version.title
        page.description_html = version.description_html
        page.description_stripped = strip_tags(version.description_html)[:100000]
        page.save()
        return Response(WikiPageSerializer(page).data)


class WikiSearchEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        query = (request.GET.get("q") or "").strip()
        if len(query) < 2:
            return Response([])
        spaces = accessible_spaces(slug, request.user).filter(archived_at__isnull=True)
        pages = (
            WikiPage.objects.filter(space__in=spaces, archived_at__isnull=True)
            .filter(Q(title__icontains=query) | Q(description_stripped__icontains=query))
            .select_related("space")[:30]
        )
        results = []
        for page in pages:
            text = page.description_stripped or ""
            idx = text.lower().find(query.lower())
            snippet = text[max(0, idx - 60) : idx + 120] if idx >= 0 else text[:160]
            results.append(
                {
                    "id": str(page.id),
                    "title": page.title,
                    "emoji": page.emoji,
                    "space_id": str(page.space_id),
                    "space_name": page.space.name,
                    "snippet": snippet,
                    "updated_at": page.updated_at,
                }
            )
        return Response(results)
