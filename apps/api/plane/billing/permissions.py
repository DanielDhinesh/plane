# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""View-level entitlement enforcement.

Usage on any view method that receives ``slug`` in its URL kwargs::

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    @require_feature(Feature.EPICS)
    def create(self, request, slug, project_id): ...

Place it *below* ``allow_permission`` so authorization is checked before plan
gating (non-members get 403, not a 402 that leaks plan information).
"""

from functools import wraps

from rest_framework.response import Response

from plane.db.models import Workspace

from .plans import Feature
from .services import BillingError, assert_feature


def billing_error_response(error: BillingError) -> Response:
    return Response(error.to_dict(), status=error.http_status)


def require_feature(feature: Feature | str):
    feature = Feature(feature)  # fail fast at import time on typos

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(instance, request, *args, **kwargs):
            slug = kwargs.get("slug")
            if slug is None:
                raise ValueError("require_feature needs a 'slug' URL kwarg")
            try:
                assert_feature(feature, slug=slug)
            except Workspace.DoesNotExist:
                return Response({"error": "Workspace not found"}, status=404)
            except BillingError as error:
                return billing_error_response(error)
            return view_func(instance, request, *args, **kwargs)

        return _wrapped

    return decorator
