# Contributing
## Pull Requests
- Name pull requests using the imperative mood (i.e. "Add feature", or "Fix bug").
- Each pull request should focus on a single, clear change.
- Keep pull request titles and descriptions in English.
- BigCommunity development uses `dev-talesam`; releases are integrated into `main` through pull requests.
- Preserve upstream attribution and the legacy storage, settings and D-Bus identifiers documented in `docs/UPGRADE.md`.

## Code Style
This project uses [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/) for linting and formatting.

You can lint and format your code by running:
```shell
make lint-fix
```

## Validation

Before opening a pull request, run:
```shell
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc --noEmit
pnpm test
python3 -m unittest discover -s tests -p 'test_uuid_migration.py'
make lint check-pot check-po
RELEASE=1 make build
```

When translatable strings or their source locations change, run `make pot -B` and `make po`, review the changes, and commit the catalogs with the code. CI validates catalogs; it does not commit to `main`.

## Development
### Configuration
Copy `.env.template` to `.env` and set any necessary environment variables which will be loaded in the Makefile.
```shell
cp .env.template .env
```

### Debugging
> [!IMPORTANT]
> GNOME Shell 49 and above requires mutter-devkit to be installed to run a GNOME Shell instance.
> <details>
> <summary>Install Mutter Devkit</summary>
>
> | Distro        | Command                            |
> |---------------|------------------------------------|
> | Fedora        | `sudo dnf install mutter-devel`    |
> | Arch Linux    | `sudo pacman -S mutter-devkit`     |
> | Ubuntu/Debian | `sudo apt install mutter-dev-bin`  |
> | openSUSE      | `sudo zypper install mutter-devel` |
> </details>

#### Extension
Install the extension and run a nested GNOME Shell instance for development and testing.
```shell
make launch
```

#### Settings
Install the extension and launch extension settings while also observing gjs/gnome-shell logs and dconf changes.
```shell
make launch-settings
```

### Useful Resources
- https://gjs.guide/extensions/
- https://gjs-docs.gnome.org/
- https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js
