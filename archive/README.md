# Inactive source archive

`legacy-source.zip` preserves the previous recording application, speech experiments, and original dependency/configuration files. These are historical files, not components of the current application. They are neither built nor deployed.

The archive contains no credentials, recordings, installed dependencies, or virtual environments. Original files were verified byte-for-byte before being moved out of the active source tree. An ignored `.legacy-local/` directory also preserves local copies.

To inspect without reintroducing obsolete modules into the application:

```sh
unzip archive/legacy-source.zip -d /tmp/kannada-kali-legacy
```

Existing cloud data and unrelated legacy cloud functions are retained. Restoring the archive does not reactivate their frontend routes.
