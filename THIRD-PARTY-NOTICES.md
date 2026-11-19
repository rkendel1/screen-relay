# Third-party notices

screen-relay is licensed under the Apache License, Version 2.0. See `LICENSE`.

The published npm package contains the third-party software listed here.

## Bundled in the CLI

### yaml 2.9.1

ISC License.

```text
Copyright Eemeli Aro <eemeli@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

### Agent detection signals

The CLI no longer bundles `@vercel/detect-agent`. Its agent detection checks the same environment variables and marker file that `@vercel/detect-agent` 1.2.7 checks. Copyright 2017 Vercel, Inc. Licensed under the Apache License, Version 2.0. The license text is in `LICENSE`.

### MIT-licensed packages

- @clack/prompts 1.9.0 and @clack/core 1.6.0: Copyright (c) 2025-Present Bombshell contributors (https://bomb.sh/team)
- sisteransi 2.0.0: Copyright (c) 2018 Terkel Gjervig Nielsen
- fast-string-width 3.0.2 and fast-string-truncated-width 3.0.3: Copyright (c) 2024-present Fabio Spampinato
- fast-wrap-ansi 0.2.2: Copyright (c) 2025 James Garbutt; Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Wayland protocol definitions in the engine source

The files in `src/engine/backends/linux/wayland/protocols/` are licensed under the MIT license. Each file carries its copyright and permission notice.

- `virtual-keyboard-unstable-v1.xml`: Copyright 2008-2011 Kristian Høgsberg; 2010-2013 Intel Corporation; 2012-2013 Collabora, Ltd.; 2018 Purism SPC
- `wlr-screencopy-unstable-v1.xml`: Copyright 2018 Simon Ser; 2019 Andri Yngvason
- `wlr-virtual-pointer-unstable-v1.xml`: Copyright 2019 Josef Gajdusek

## Libraries the engine links when it is built

screen-relay does not distribute these. `screen-relay install` builds the engine on your machine against the copies your system provides.

- x264: GPL-2.0-or-later. An engine binary that links x264 is covered by the GPL if you redistribute it.
- libwebsockets: MIT
- zlib: zlib license
- libX11, libXext, libXdamage, libXfixes, libXtst, libwayland-client, libxkbcommon: MIT and similar permissive licenses
