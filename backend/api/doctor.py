from __future__ import annotations

from fastapi import APIRouter, Request

from api.security import MEMORY_RATE_LIMITER, enforce_rate_limit, require_api_auth
from doctor import run_report, run_runtime_checks

router = APIRouter(prefix="/api/doctor", tags=["doctor"])


@router.get("/runtime")
async def doctor_runtime_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "doctor_runtime")

    checks = await run_runtime_checks()
    return {
        "checks": [check.__dict__ for check in checks],
        "all_passed": all(check.passed for check in checks),
    }


@router.get("/report")
async def doctor_report_endpoint(request: Request):
    require_api_auth(request)
    await enforce_rate_limit(request, MEMORY_RATE_LIMITER, "doctor_report")
    return await run_report()
