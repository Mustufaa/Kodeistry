"""Check a running production frontend without credentials or third-party calls.

Usage: python scripts/verify-seo.py [base_url] [canonical_origin]
Start the production server first. Uses only Python's standard library.
"""
import json
import re
import struct
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
ORIGIN = (sys.argv[2] if len(sys.argv) > 2 else "https://kodeistry.onrender.com").rstrip("/")
PUBLIC = {"/", "/privacy", "/terms", "/features/ai-code-review",
          "/features/github-integration", "/features/security-analysis",
          "/how-it-works", "/docs", "/faq"}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect())

def fetch(path):
    try:
        response = opener.open(Request(BASE + path, headers={"User-Agent": "KodeistrySEOCheck/1.0"}), timeout=60)
    except HTTPError as error:
        response = error
    return response.status, response.headers, response.read()

class Page(HTMLParser):
    def __init__(self, raw):
        super().__init__(convert_charrefs=True)
        self.metas, self.canonicals, self.links, self.images = {}, [], [], []
        self.ids, self.headings, self.jsonld, self.visible = set(), [], [], []
        self.title, self.in_title, self.in_script, self.in_style = "", False, False, False
        self.script_type, self.script_text = "", ""
        self.feed(raw.decode("utf-8"))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "title":
            self.in_title = True
        if tag == "style":
            self.in_style = True
        if tag == "meta":
            key = a.get("name", a.get("property"))
            if key:
                self.metas.setdefault(key, []).append(a.get("content", ""))
        if tag == "link" and a.get("rel") == "canonical":
            self.canonicals.append(a.get("href"))
        if tag == "a" and "href" in a:
            self.links.append(a["href"])
        if tag == "img":
            self.images.append(a)
        if re.fullmatch("h[1-6]", tag):
            self.headings.append(int(tag[1]))
        if tag == "script":
            self.in_script, self.script_type, self.script_text = True, a.get("type"), ""

    def handle_data(self, text):
        if self.in_title:
            self.title += text
        if self.in_script:
            self.script_text += text
        elif not self.in_style:
            self.visible.append(text)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "style":
            self.in_style = False
        if tag == "script":
            if self.script_type == "application/ld+json":
                self.jsonld.append(json.loads(self.script_text))
            self.in_script = False

    def meta(self, key):
        values = self.metas.get(key, [])
        assert len(values) == 1, (key, values)
        return values[0]

def normalized(text):
    return " ".join(text.split())

def validate_schema(data, path, page):
    assert data["@context"] == "https://schema.org", path
    nodes = data.get("@graph", [data])
    for node in nodes:
        assert node["@type"] in {"Organization", "WebSite", "SoftwareApplication", "BreadcrumbList", "FAQPage"}
        assert not any(key in node for key in ("aggregateRating", "review", "offers")), path
        if node["@type"] == "BreadcrumbList":
            items = node["itemListElement"]
            assert [i["position"] for i in items] == [1, 2], path
            assert items[-1]["item"] == ORIGIN + path, path
        elif node["@type"] == "FAQPage":
            assert path == "/faq"
            visible = normalized(" ".join(page.visible))
            assert len(node["mainEntity"]) >= 9
            for question in node["mainEntity"]:
                assert question["@type"] == "Question"
                assert question["acceptedAnswer"]["@type"] == "Answer"
                assert normalized(question["name"]) in visible
                assert normalized(question["acceptedAnswer"]["text"]) in visible
        else:
            assert node["name"] == "Kodeistry"
            assert node["url"] == ORIGIN + "/"

status, _, xml = fetch("/sitemap.xml")
assert status == 200
root = ElementTree.fromstring(xml)
locations = [element.text for element in root.findall("{*}url/{*}loc")]
assert len(locations) == len(set(locations)) == len(PUBLIC), locations
assert set(locations) == {ORIGIN + path for path in PUBLIC}, locations
assert not root.findall("{*}url/{*}lastmod"), "Do not invent modification dates"

status, _, body = fetch("/robots.txt")
assert status == 200
robots_text = body.decode()
robots = RobotFileParser()
robots.parse(robots_text.splitlines())
assert "Sitemap: " + ORIGIN + "/sitemap.xml" in robots_text
# Python uses first-match precedence; major search crawlers use longest-match.
assert "Disallow: /api/" in robots_text
for agent in ("Googlebot", "bingbot", "OAI-SearchBot", "PerplexityBot"):
    for path in PUBLIC:
        assert robots.can_fetch(agent, BASE + path), (agent, path)
# A crawler must be able to read noindex on private/authentication shells.
assert robots.can_fetch("Googlebot", BASE + "/login")

pages, titles, descriptions = {}, set(), set()
for path in sorted(PUBLIC):
    status, headers, html = fetch(path)
    assert status == 200, (path, status)
    assert "noindex" not in headers.get("X-Robots-Tag", "")
    page = Page(html)
    pages[path] = page
    assert len(page.canonicals) == 1 and page.canonicals[0].rstrip("/") == (ORIGIN + path).rstrip("/"), (path, page.canonicals)
    assert "index" in page.meta("robots").split(", "), path
    assert "noindex" not in page.meta("robots"), path
    assert page.title and page.title not in titles, (path, page.title)
    description = page.meta("description")
    assert description and description not in descriptions, path
    titles.add(page.title)
    descriptions.add(description)
    assert page.meta("og:title") == page.title
    assert page.meta("twitter:title") == page.title
    assert page.meta("og:description") == description
    assert page.meta("twitter:description") == description
    assert page.meta("og:url").rstrip("/") == (ORIGIN + path).rstrip("/")
    assert page.meta("og:image") == ORIGIN + "/social-image"
    assert page.meta("twitter:card") == "summary_large_image"
    assert page.meta("viewport")
    assert page.headings.count(1) == 1, (path, page.headings)
    assert all(b <= a + 1 for a, b in zip(page.headings, page.headings[1:])), path
    assert all("alt" in image and "width" in image and "height" in image for image in page.images), path
    assert page.jsonld, path
    for data in page.jsonld:
        validate_schema(data, path, page)
assert pages["/"].meta("google-site-verification")

checked_links = set()
for path, page in list(pages.items()):
    for href in page.links:
        target = urlsplit(urljoin(BASE + path, href))
        if target.netloc != urlsplit(BASE).netloc:
            continue
        target_path = target.path or "/"
        if target_path not in pages:
            status, _, html = fetch(target_path)
            assert status == 200, (path, href, status)
            pages[target_path] = Page(html)
        if target.fragment:
            assert target.fragment in pages[target_path].ids, (path, href)
        checked_links.add(target_path)

app = Path(__file__).resolve().parents[1] / "app"
private_paths = set()
for group in ("(auth)", "(dashboard)"):
    for page_file in (app / group).rglob("page.tsx"):
        segments = page_file.parent.relative_to(app / group).parts
        private_paths.add("/" + "/".join("1" if part.startswith("[") else part for part in segments))
private_paths.add("/invite")
for path in sorted(private_paths):
    status, headers, body = fetch(path)
    assert status == 200, (path, status)
    page = Page(body)
    assert "noindex" in page.meta("robots"), path
    assert "noindex" in headers.get("X-Robots-Tag", ""), path
    assert not page.canonicals and not page.jsonld, path
    assert page.title not in titles, (path, page.title)
    titles.add(page.title)
    description = page.meta("description")
    assert description not in descriptions, path
    descriptions.add(description)

status, _, body = fetch("/this-page-does-not-exist-seo-check")
assert status == 404, status
assert any("noindex" in value for value in Page(body).metas.get("robots", []))
status, headers, _ = fetch("/faq/")
assert status in (301, 308), status
assert urlsplit(headers["Location"]).path == "/faq"
status, _, body = fetch("/faq?source=seo-check")
assert status == 200 and Page(body).canonicals == [ORIGIN + "/faq"]

status, headers, body = fetch("/llms.txt")
assert status == 200 and "text/plain" in headers.get("Content-Type", "")
assert all(location in body.decode() for location in locations)
status, headers, png = fetch("/social-image")
assert status == 200 and "image/png" in headers.get("Content-Type", "")
assert png[:8] == b"\x89PNG\r\n\x1a\n"
assert struct.unpack(">II", png[16:24]) == (1200, 630)
status, _, _ = fetch("/_next/image?url=%2Fbrand%2Fkodeistry-black.png&w=64&q=75")
assert status == 200, ("optimized logo", status)
print("PASS:", len(PUBLIC), "public pages;", len(private_paths), "private routes;", len(checked_links), "internal link targets")
print("PASS: sitemap, robots, metadata, canonicals, JSON-LD shape/visible FAQs, 404, redirect, llms.txt, social image, optimized logo")
print("Does not measure browser responsiveness/Core Web Vitals or authenticate to GitHub.")
