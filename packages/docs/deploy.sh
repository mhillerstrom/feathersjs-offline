#!/usr/bin/env sh

fix_paths() {
  echo "fix_path ${1}..."
  cat ${1} | sed -e 's_href="/"_href="@"_g'   \
         | sed -e 's_href="/_href="_g'      \
         | sed -e 's_src="/_src="_g'        \
         | sed -e 's_src="docs/img_src="img_g'  \
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

# build
npm run build

git init

# navigate into the final output directory
cd docs
#rm -rf *

cd ../.vuepress/dist
git add -A

#cp -R * ../../docs

cd ../../docs

# Change all paths with leading '/' to same path without leading '/'
find . -name '*.html' -exec bash -c 'fix_paths {}' \; 

git add -A

# if you are deploying to a custom domain
# echo 'www.example.com' > CNAME

git commit -m 'deploy'

# if you are deploying to https://<USERNAME>.github.io
# git push -f git@github.com:<USERNAME>/<USERNAME>.github.io.git master

# if you are deploying to https://<USERNAME>.github.io/<REPO>
#git push -f git@github.com:feathersjs-offline/docs.git crow:crow
git push

cd -
