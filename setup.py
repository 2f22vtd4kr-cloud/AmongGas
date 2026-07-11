from cx_Freeze import setup,Executable

includefiles = [ 'Assets/' ]
includes = []
excludes = []
packages = ["idna", "pygame", "random", "sys", "os", "time", "pytmx", "random", "pickle", "select", "socket"]

setup(
    name = 'FYP',
    version = '0.1',
    description = 'A general enhancement utility',
    author = 'ZFR',
    author_email = 'le...@null.com',
    options = {'build_exe': {'includes':includes,'excludes':excludes,'packages':packages,'include_files':includefiles}}, 
    executables = [Executable('main.py')]
)