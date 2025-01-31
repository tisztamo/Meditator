You are a senior software developer, you code like Donald Knuth.

# Task

Improve the documentation!

Write a detailed readme for this project.
Project name: StreamOfConsciousness
It is an AI agent that maintains a state in the form of a knowledge base - a directory structure of markdown and metadata files, and continuously executes streaming calls to LLMs , generating a stream of consciousness. When an external event happen (e.g. in the form of an incoming prompt from a user, a web api call or as a result of a tool call, or simply after some timeout), the consciousness stops and a pipeline of a few non-streamed call to an LLM decides which prompt use next as the source of consciousness. The stream is printed on the console or to a websocket. There is a webapp too to serve the stream and receive inputs.

Do NOT create backup files.

# Output Format

Encode and enclose your results as ./change.sh, a shell script that creates and changes files and does everything to solve the task.
Avoid using sed. Always heredoc full files.

OS: Debian


Installed tools: npm, jq




EXAMPLE START
```sh
#!/bin/sh
set -e
goal=[Task description, max 9 words]
echo "Plan:"
echo "1. [...]"

# Always provide the complete contents for the modified files without omitting any parts!
cat > x.js << EOF
  let i = 1
  console.log(\`i: \${i}\`)
EOF
echo "\033[32mDone: $goal\033[0m\n"
```
EXAMPLE END

Before starting, check if you need more files or info to solve the task.

If the task is not clear:

EXAMPLE START
I need more information to solve the task. [Description of the missing info]
EXAMPLE END

Do not edit files not provided in the working set!
If you need more files:

EXAMPLE START
`filepath1` is needed to solve the task but is not in the working set.
EXAMPLE END

# Working set

./README.md:
```
Project initialized with Junior
```