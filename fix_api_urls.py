#!/usr/bin/env python3
import re
import sys

def fix_api_urls(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Add import if not present
    if 'getApiUrl' not in content:
        # Find the last import line
        lines = content.split('\n')
        last_import_index = 0
        for i, line in enumerate(lines):
            if line.strip().startswith('import '):
                last_import_index = i
        
        # Insert import after last import
        lines.insert(last_import_index + 1, "import { getApiUrl } from '../config';")
        content = '\n'.join(lines)
    
    # Replace hardcoded URLs
    # Pattern 1: fetch('http://localhost:3001/api/...', {
    content = re.sub(
        r"fetch\('http://localhost:3001(/api/[^']+)'\s*,",
        r"fetch(getApiUrl('\1'),",
        content
    )
    
    # Pattern 2: fetch(`http://localhost:3001/api/...${var}...`, {
    content = re.sub(
        r"fetch\(`http://localhost:3001(/api/[^`]+)`\s*,",
        lambda m: f"fetch(getApiUrl(`{m.group(1)}`),",
        content
    )
    
    # Pattern 3: standalone URLs like `http://localhost:3001/api/...`  
    content = re.sub(
        r"`http://localhost:3001(/api/[^`]+)`",
        lambda m: f"getApiUrl(`{m.group(1)}`)",
        content
    )
    
    # Pattern 4: 'http://localhost:3001/api/...'
    content = re.sub(
        r"'http://localhost:3001(/api/[^']+)'",
        lambda m: f"getApiUrl('{m.group(1)}')",
        content
    )
    
    with open(filename, 'w') as f:
        f.write(content)
    print(f"Fixed {filename}")

if __name__ == '__main__':
    for filename in sys.argv[1:]:
        fix_api_urls(filename)
