from __future__ import annotations

import asyncio
import os
import smtplib
from email.mime.text import MIMEText

from .base import BaseTool, ToolResult


def _enabled() -> bool:
    raw = os.getenv("KODO_ENABLE_EMAIL", "0").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _send_smtp_message(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    sender: str,
    recipient: str,
    subject: str,
    body: str,
    html: bool,
) -> None:
    msg = MIMEText(body, "html" if html else "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.starttls()
        if username:
            smtp.login(username, password)
        smtp.sendmail(sender, [recipient], msg.as_string())


class SendEmailTool(BaseTool):
    name = "send_email"
    description = (
        "Send an email via SMTP. Requires SMTP configuration in .env. "
        "Use for notifications, reports, or agent-driven communication."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "html": {"type": "boolean", "default": False},
        },
        "required": ["to", "subject", "body"],
    }

    async def execute(self, to: str, subject: str, body: str, html: bool = False, **kwargs) -> ToolResult:
        if not _enabled():
            return ToolResult(success=False, output="", error="send_email is disabled. Set KODO_ENABLE_EMAIL=1.")

        recipient = to.strip()
        if not recipient:
            return ToolResult(success=False, output="", error="Recipient email is required")

        smtp_host = os.getenv("SMTP_HOST", "").strip()
        smtp_port = int(os.getenv("SMTP_PORT", "587") or 587)
        smtp_user = os.getenv("SMTP_USER", "").strip()
        smtp_pass = os.getenv("SMTP_PASS", "").strip()
        smtp_from = os.getenv("SMTP_FROM", "").strip() or smtp_user

        if not smtp_host or not smtp_from:
            return ToolResult(
                success=False,
                output="",
                error="SMTP config missing. Set SMTP_HOST and SMTP_FROM (or SMTP_USER).",
            )

        try:
            await asyncio.to_thread(
                _send_smtp_message,
                host=smtp_host,
                port=smtp_port,
                username=smtp_user,
                password=smtp_pass,
                sender=smtp_from,
                recipient=recipient,
                subject=subject,
                body=body,
                html=bool(html),
            )
        except Exception as exc:
            return ToolResult(success=False, output="", error=f"Email send failed: {exc}")

        return ToolResult(
            success=True,
            output=f"Email sent to {recipient}",
            metadata={"to": recipient, "subject": subject, "from": smtp_from},
        )
