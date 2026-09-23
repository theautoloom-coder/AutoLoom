"""Print the centre of the first uiautomator node whose label contains WANT.

Kept as its own file rather than inline in the shell script: quoting a regex
through bash, MSYS and python at once is how the previous three attempts broke.

Reads the dump path from XML and the search text from WANT, prints "x y".
"""
import os
import re
import sys

xml = open(os.environ["XML"], encoding="utf-8", errors="replace").read()
want = os.environ["WANT"].lower()

NODE = re.compile(r"<node[^>]*>")
TEXT = re.compile(r'text="([^"]*)"')
DESC = re.compile(r'content-desc="([^"]*)"')
BOUNDS = re.compile(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')

for m in NODE.finditer(xml):
    tag = m.group(0)
    label = (TEXT.search(tag) or DESC.search(tag))
    text = TEXT.search(tag)
    desc = DESC.search(tag)
    joined = " ".join(filter(None, [text.group(1) if text else "", desc.group(1) if desc else ""]))
    if want not in joined.lower():
        continue
    b = BOUNDS.search(tag)
    if not b:
        continue
    x1, y1, x2, y2 = map(int, b.groups())
    # A zero-area node is laid out but not drawn; tapping it does nothing.
    if x2 <= x1 or y2 <= y1:
        continue
    print((x1 + x2) // 2, (y1 + y2) // 2)
    sys.exit(0)

sys.exit(1)
