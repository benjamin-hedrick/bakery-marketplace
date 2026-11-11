import re
# One-off (register 175): the cost table of docs/method/ai-collaboration.md in relative cost, without the wall-clock column.
p = 'docs/method/ai-collaboration.md'
text = open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in text else '\n'
out = []
total_raw = 0.0
for line in text.split(nl):
    if line.startswith('| Session | Work | Cost | API time | Wall-clock | Lines added |'):
        line = '| Session | Work | Relative cost | API time | Lines added |'
    elif line.startswith('|') and re.match(r'^\|[^|]*\|[^|]*\|\s*\$[\d.]+', line):
        cells = [c.strip() for c in line.strip('|').split('|')]
        raw = float(cells[2].lstrip('$'))
        total_raw += raw
        cells[2] = f'{raw / 2:.2f}'
        del cells[4]  # the wall-clock column
        line = '| ' + ' | '.join(cells) + ' |'
    elif line.startswith('| **Total**'):
        cells = [c.strip() for c in line.strip('|').split('|')]
        cells[2] = f'**{total_raw / 2:.2f}**'
        del cells[4]
        line = '| ' + ' | '.join(cells) + ' |'
    elif line.startswith('|---|---|---:|---:|---:|---:|'):
        line = '|---|---|---:|---:|---:|'
    out.append(line)
open(p, 'w', encoding='utf-8', newline='').write(nl.join(out))
print(total_raw)
