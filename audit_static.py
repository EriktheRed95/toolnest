from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json
class Scan(HTMLParser):
 def __init__(self):super().__init__();self.refs=[];self.labels=set();self.inputs=[];self.inlabel=False;self.ids=set();self.duplicates=[]
 def handle_starttag(self,t,a):
  d=dict(a)
  if d.get('id'):
   if d['id'] in self.ids:self.duplicates.append(d['id'])
   self.ids.add(d['id'])
  if t=='label':self.labels.add(d.get('for'));self.inlabel=True
  if t in ('input','select','textarea') and d.get('type') not in ('hidden','submit','button'):self.inputs.append({**d,"wrapped":self.inlabel})
  for k in ('src','href'):
   if k in d:self.refs.append(d[k])
 def handle_endtag(self,t):
  if t=='label':self.inlabel=False
root=Path('docs');broken=[];labels=[];placeholders=[];duplicates=[]
for p in root.rglob('*.html'):
 s=Scan();content=p.read_text(encoding='utf-8');s.feed(content)
 duplicates.extend([str(p),i] for i in s.duplicates)
 for r in s.refs:
  u=urlsplit(r)
  if u.scheme or u.netloc or not u.path:continue
  target=root/unquote(u.path.removeprefix('/toolnest/')) if u.path.startswith('/toolnest/') else p.parent/unquote(u.path)
  if target.is_dir():target/= 'index.html'
  if not target.exists():broken.append([str(p),r])
 for d in s.inputs:
  if not d.get('wrapped') and d.get('id') not in s.labels and not d.get('aria-label') and not d.get('aria-labelledby'):labels.append([str(p),d.get('id')])
 for needle in ['you@example.com','YOUR_API_KEY','TODO','Lorem ipsum']:
  if needle in content:placeholders.append([str(p),needle])
print(json.dumps({'pages':len(list(root.rglob('*.html'))),'broken_links':broken,'unassociated_controls':labels,'duplicate_ids':duplicates,'placeholders':placeholders},indent=2))
raise SystemExit(1 if broken or labels or duplicates else 0)
