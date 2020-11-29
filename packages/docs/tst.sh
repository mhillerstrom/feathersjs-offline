#!/usr/bin/env sh

fix_paths() {
  echo "fix_path ${1}..."
  cat ${1} | sed -e 's_href="/"_href="@"_g'   \
         | sed -e 's_href="/_href="_g'      \
         | sed -e 's_src="/_src="_g'        \
         | sed -e 's_src="docs/img_src="img_g'  \
         | sed -e 's_href="\(.*\)/"_href="\1/index.html"_g' \
         | sed -e 's_href="@"_href="/"_g' > tmp
  mv tmp ${1}
}
export -f fix_paths

if [ "x${1}" != "x" ];
then
	fix_paths ${1}
	more ${1}
	exit 0
fi

# abort on errors
set -e

# navigate into the final output directory
cd docs

# Change all paths with leading '/' to same path without leading '/'
find . -name '*.html' -exec bash -c 'fix_paths {}' \; 


