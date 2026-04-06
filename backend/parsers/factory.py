"""
ParserFactory — selects the correct platform parser based on settings.
Supports apify vs legacy fallback strategy for Instagram and TikTok.
"""
from __future__ import annotations

import structlog

from backend.parsers.base import BasePlatformParser

logger = structlog.get_logger(__name__)


class ParserFactory:
    def get_parser(self, platform: str, settings: dict[str, str]) -> BasePlatformParser:
        """
        Return the appropriate parser for the given platform.
        Falls back gracefully when preferred parser is not configured.
        """
        p = platform.lower()

        if p == "youtube":
            from backend.parsers.youtube import YouTubeParser
            return YouTubeParser()

        elif p == "instagram":
            session_id = settings.get("instagram_session_id", "").strip()
            apify_key = settings.get("apify_api_key", "")
            prefer_apify = settings.get("parser_instagram", "apify") == "apify"

            if session_id:
                # instagrapi uses private mobile API — most reliable with session cookie
                from backend.parsers.instagram_instagrapi import InstagrapiInstagramParser
                logger.info("parser_factory.instagram=instagrapi")
                return InstagrapiInstagramParser(session_id)
            elif prefer_apify and apify_key:
                # Apify — works without session but requires residential proxies (paid)
                from backend.parsers.instagram_apify import ApifyInstagramParser
                logger.info("parser_factory.instagram=apify")
                return ApifyInstagramParser(apify_key)
            else:
                from backend.parsers.instagram_legacy import LegacyInstagramParser
                logger.info("parser_factory.instagram=legacy_anon")
                return LegacyInstagramParser(None)

        elif p == "tiktok":
            apify_key = settings.get("apify_api_key", "")
            prefer_apify = settings.get("parser_tiktok", "apify") == "apify"
            if prefer_apify and apify_key:
                from backend.parsers.tiktok_apify import ApifyTikTokParser
                logger.debug("parser_factory.tiktok=apify")
                return ApifyTikTokParser(apify_key)
            else:
                from backend.parsers.tiktok_legacy import LegacyTikTokParser
                logger.debug("parser_factory.tiktok=playwright")
                return LegacyTikTokParser()

        elif p == "vk":
            from backend.parsers.vk import VKParser
            return VKParser(settings.get("vk_access_token"))

        else:
            raise ValueError(f"Неизвестная платформа: {platform}")

    def get_instagram_parser_for_account(
        self,
        scraper_session_json: str | None,
        apify_key: str,
    ) -> BasePlatformParser:
        """Return the best Instagram parser given a scraper session (if any)."""
        if scraper_session_json:
            from backend.parsers.instagram_instagrapi import InstagrapiInstagramParser
            logger.info("parser_factory.instagram=instagrapi_session_json")
            return InstagrapiInstagramParser(session_json=scraper_session_json)
        elif apify_key:
            from backend.parsers.instagram_apify import ApifyInstagramParser
            logger.info("parser_factory.instagram=apify")
            return ApifyInstagramParser(apify_key)
        else:
            from backend.parsers.instagram_legacy import LegacyInstagramParser
            logger.info("parser_factory.instagram=legacy_anon")
            return LegacyInstagramParser(None)


# Module-level singleton
parser_factory = ParserFactory()
