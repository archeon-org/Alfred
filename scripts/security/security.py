"""Static scanner fixtures only: this file must never be executed."""
import ast
import json
import os
import pickle
import subprocess
import yaml

payload = input()
# ruleid: alfred-python-dynamic-code
eval(payload)
# ruleid: alfred-python-dynamic-code
exec(payload)
# ok: alfred-python-dynamic-code
ast.literal_eval(payload)
# ruleid: alfred-python-shell-command
os.system(payload)
# ruleid: alfred-python-shell-command
subprocess.run(payload, shell=True)
# ok: alfred-python-shell-command
subprocess.run(["echo", payload], shell=False)
# ruleid: alfred-python-unsafe-yaml
yaml.load(payload, Loader=yaml.Loader)
# ruleid: alfred-python-unsafe-yaml
yaml.unsafe_load(payload)
# ok: alfred-python-unsafe-yaml
yaml.safe_load(payload)
# ok: alfred-python-unsafe-yaml
yaml.load(payload, Loader=yaml.SafeLoader)
# ruleid: alfred-python-pickle-load
pickle.loads(payload)
# ok: alfred-python-pickle-load
json.loads(payload)
