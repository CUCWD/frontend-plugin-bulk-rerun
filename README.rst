frontend-plugin-bulk-rerun
#############################

|license-badge| |status-badge| |ci-badge| |codecov-badge|

⚠️ Warning ⚠️
***************

This template uses a version of Paragon that includes `design tokens <https://github.com/openedx/paragon/?tab=readme-ov-file#design-tokens>`_ support. Support for design tokens is a breaking change, and more information is available in `the DEPR <https://github.com/openedx/brand-openedx/issues/23>`_.

To use this template with a pre-design-tokens version of Paragon, you can utilize `the release/teak branch <https://github.com/CUCWD/frontend-plugin-bulk-rerun/tree/release/teak>`_.

Purpose
*******

Lets administrators provision and rerun multiple courses at once directly from
the Studio Home — selecting organizations and programs, configuring shared settings
like scheduling, certificates, and team access, and tracking live Celery task progress
per course. It connects to the openedx-bulk-rerun-ext Django backend to validate course keys, submit batch jobs, and stream real-time log output as each course is created.

Delivered as a frontend-plugin-framework direct plugin, it slots into Studio Home
without modifying frontend-app-authoring source code, making it portable across
Open edX platform upgrades.

Getting Started
***************

Prerequisites
=============

`Tutor`_ is currently recommended as the development environment for your
new MFE.  You can refer to the `relevant tutor-mfe documentation`_ to get started using it.

.. _Tutor: https://github.com/overhangio/tutor

.. _relevant tutor-mfe documentation: https://github.com/overhangio/tutor-mfe#mfe-development

Cloning and Startup
===================

#. Clone your new repo:

   .. code-block:: sh

      git clone https://github.com/CUCWD/frontend-plugin-bulk-rerun.git

#. Use the version of Node specified in the ``.nvmrc`` file.

   .. code-block:: sh

      The current version of the micro-frontend build scripts supports the version of Node found in ``.nvmrc``.
      Using other major versions of node *may* work, but this is unsupported.  For
      convenience, this repository includes an .nvmrc file to help in setting the
      correct node version via `nvm <https://github.com/nvm-sh/nvm>`_.

#. Install npm dependencies:

   .. code-block:: sh
   
      cd frontend-plugin-bulk-rerun && npm install

#. Create/Update the ``env.config.jsx`` file inside ``frontend-app-authoring`` with the slot definitions

   .. code-block:: jsx

      import { DIRECT_PLUGIN, PLUGIN_OPERATIONS } from '@openedx/frontend-plugin-framework';
      import { BulkRerunsTab } from '@cucwd/frontend-plugin-bulk-rerun';

      const config = {
        ...process.env,
        pluginSlots: {
          'org.cucwd.frontend.authoring.studio_home_bulk_reruns.v1': {
            keepDefault: false,
            plugins: [
              {
                op: PLUGIN_OPERATIONS.Insert,
                widget: {
                  id:           'bulk_reruns_tab',
                  type:         DIRECT_PLUGIN,
                  priority:     50,
                  RenderWidget: BulkRerunsTab,
                },
              },
            ],
          },
        },
      };

      export default config;

#. Update the application port to use for local development:

   Default port is 8080. If this does not work for you, update the line
   `PORT=8080` to your port in all .env.* files

#. Start the dev server:

   .. code-block:: sh

      npm start

The dev server is running at `http://localhost:8080 <http://localhost:8080>`_
or whatever port you setup.

Developing
**********

Known Issues
============

N/A

Roadmap
=======

N/A


Project Structure
=================

The source for this project is organized into nested submodules according to
the `Feature-based Application Organization ADR`_.

.. _Feature-based Application Organization ADR: https://github.com/CUCWD/frontend-plugin-bulk-rerun/blob/master/docs/decisions/0002-feature-based-application-organization.rst

Build Process Notes
===================

**Production Build**

The production build is created with ``npm run build``.

Internationalization
====================

Please see refer to the `frontend-platform i18n howto`_ for documentation on
internationalization.

.. _frontend-platform i18n howto: https://github.com/openedx/frontend-platform/blob/master/docs/how_tos/i18n.rst

Getting Help
************

If you're having trouble, we have discussion forums at
https://discuss.openedx.org where you can connect with others in the community.

Our real-time conversations are on Slack. You can request a `Slack
invitation`_, then join our `community Slack workspace`_.  Because this is a
frontend repository, the best place to discuss it would be in the `#wg-frontend
channel`_.

For anything non-trivial, the best path is to open an issue in this repository
with as many details about the issue you are facing as you can provide.

https://github.com/CUCWD/frontend-plugin-bulk-rerun/issues

For more information about these options, see the `Getting Help`_ page.

.. _Slack invitation: https://openedx.org/slack
.. _community Slack workspace: https://openedx.slack.com/
.. _#wg-frontend channel: https://openedx.slack.com/archives/C04BM6YC7A6
.. _Getting Help: https://openedx.org/getting-help

License
*******

The code in this repository is licensed under the AGPLv3 unless otherwise
noted.

Please see `LICENSE <LICENSE>`_ for details.

Contributing
************

Contributions are very welcome.  Please read `How To Contribute`_ for details.

.. _How To Contribute: https://openedx.org/r/how-to-contribute

This project is currently accepting all types of contributions, bug fixes,
security fixes, maintenance work, or new features.  However, please make sure
to have a discussion about your new feature idea with the maintainers prior to
beginning development to maximize the chances of your change being accepted.
You can start a conversation by creating a new issue on this repo summarizing
your idea.

The Open edX Code of Conduct
****************************

All community members are expected to follow the `Open edX Code of Conduct`_.

.. _Open edX Code of Conduct: https://openedx.org/code-of-conduct/

People
******

The assigned maintainers for this component and other project details may be
found in `Backstage`_. Backstage pulls this data from the ``catalog-info.yaml``
file in this repo.

.. _Backstage: https://open-edx-backstage.herokuapp.com/catalog/default/component/frontend-plugin-bulk-rerun

Reporting Security Issues
*************************

Please do not report security issues in public, and email security@openedx.org instead.

.. |license-badge| image:: https://img.shields.io/github/license/openedx/frontend-plugin-bulk-rerun.svg
    :target: https://github.com/CUCWD/frontend-plugin-bulk-rerun/blob/main/LICENSE
    :alt: License

.. |status-badge| image:: https://img.shields.io/badge/Status-Maintained-brightgreen

.. |ci-badge| image:: https://github.com/CUCWD/frontend-plugin-bulk-rerun/actions/workflows/ci.yml/badge.svg
    :target: https://github.com/CUCWD/frontend-plugin-bulk-rerun/actions/workflows/ci.yml
    :alt: Continuous Integration

.. |codecov-badge| image:: https://codecov.io/github/openedx/frontend-plugin-bulk-rerun/coverage.svg?branch=main
    :target: https://codecov.io/github/openedx/frontend-plugin-bulk-rerun?branch=main
    :alt: Codecov
