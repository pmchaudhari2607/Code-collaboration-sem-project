import os
import re

directory = r'C:\Users\pmcha\OneDrive\Desktop\SEM_Project_(CodePortal)AG\frontend\js'

for filename in os.listdir(directory):
    if filename.endswith(".js") and filename != "icons.js":
        filepath = os.path.join(directory, filename)
        with open(filepath, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Replace Icons.abc with window.icon('abc')
        # except when it's already window.icon
        new_content = re.sub(r'(?<!window\.icon\()Icons\.([a-zA-Z]+)', r"window.icon('\1')", content)
        
        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print(f"Updated {filename}")
