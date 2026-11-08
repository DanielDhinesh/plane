# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.apps import AppConfig


class SuiteConfig(AppConfig):
    name = "plane.suite"
    label = "suite"
    verbose_name = "Stratify suite (teams, workflows, wiki, templates, mail, sheets)"
    default_auto_field = "django.db.models.BigAutoField"
