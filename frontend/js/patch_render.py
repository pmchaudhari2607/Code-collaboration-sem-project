import os
import re

directory = r'C:\Users\pmcha\OneDrive\Desktop\SEM_Project_(CodePortal)AG\frontend\js'
files_to_patch = [
    'dashboard.js', 'projects.js', 'project-details.js', 'reviews.js', 
    'tasks.js', 'team.js', 'notifications.js', 'analytics.js', 
    'calendar.js', 'profile.js', 'auth.js'
]

for filename in files_to_patch:
    filepath = os.path.join(directory, filename)
    if not os.path.exists(filepath): continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if "document.addEventListener('crh_user_changed'" in content:
        continue # Already patched
        
    # Match document.addEventListener('DOMContentLoaded', async () => { OR () => {
    pattern = re.compile(r"document\.addEventListener\('DOMContentLoaded',\s*(async\s*)?\(\)\s*=>\s*\{", re.MULTILINE)
    match = pattern.search(content)
    
    if match:
        is_async = match.group(1) or ''
        start_idx = match.start()
        end_idx = match.end()
        
        # We need to find the matching closing bracket for this.
        # But wait, usually it's just the last }); in the file, OR just before window.globalVars
        # Let's do a simple brace counting starting from end_idx.
        count = 1
        i = end_idx
        while count > 0 and i < len(content):
            if content[i] == '{': count += 1
            elif content[i] == '}': count -= 1
            i += 1
            
        # i is now immediately after the closing brace of the callback.
        # usually there is a ); after it.
        if i < len(content) and content[i:i+2] == ');':
            # Great, we found the end.
            new_content = content[:start_idx] + f"const _pageRender = {is_async}() => {{" + content[end_idx:i-1] + f"}};\ndocument.addEventListener('DOMContentLoaded', _pageRender);\ndocument.addEventListener('crh_user_changed', _pageRender);" + content[i+2:]
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Patched {filename}")
        else:
            print(f"Could not find end of DOMContentLoaded in {filename}")
