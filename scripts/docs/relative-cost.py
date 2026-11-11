import glob, re, sys

# One-off conversion (register 175, 2026-11-11): the usage records show a relative cost (the screen's cost divided by the base 2.00, two decimals), not
# dollars, and carry no wall-clock time. Run with --write to change the files; without it, prints what would change.
BASE = 2.00
write = '--write' in sys.argv

def rel(match):
    v = float(match.group(1).replace(',', ''))
    r = v / BASE
    return 'under 0.01' if r < 0.005 else f'{r:,.2f}'

money = re.compile(r'\$(\d[\d,]*(?:\.\d+)?)')
NOTE = (' Cost is a **relative cost**: the screen\'s figure divided by a base of 2.00, to two decimals, a size compared with other sessions and not money '
        '(register 175). The dollar figures and the wall-clock times of the first version of this record were removed on 2026-11-11.')

for path in sorted(glob.glob('docs/evidence/ai-usage-*.md')):
    text = open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in text else '\n'
    out = []
    for line in text.split(nl):
        if line.startswith('| Wall-clock time'):
            continue
        if line.startswith('- **Wall-clock time is'):
            continue
        if line.startswith('| Total cost') or line.startswith('| Cost'):
            line = re.sub(r'^\| (Total cost|Cost)', '| Relative cost (screen cost ÷ 2.00)', line)
        line = money.sub(rel, line)
        line = line.replace('value per dollar', 'value per unit of cost')
        if line.startswith('> **Status:**') and 'relative cost' not in line:
            line = line.rstrip() + NOTE
        out.append(line)
    new = nl.join(out)
    if new != text:
        print(path)
        if write:
            open(path, 'w', encoding='utf-8', newline='').write(new)
