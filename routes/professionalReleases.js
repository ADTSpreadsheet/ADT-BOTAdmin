"use strict";

const express = require("express");
const multer = require("multer");

const {
  createProfessionalReleaseService,
  MAX_FILE_SIZE_BYTES,
  XLSM_MIME_TYPE
} = require("../services/professionalReleaseService");


/*
  ============================================================
  ADT-PILEFiX PROFESSIONAL RELEASE ROUTES
  File: routes/professionalReleases.js

  Mounted from server.js at:

    /api/admin/professional/releases

  Final endpoints:

    GET  /api/admin/professional/releases
    POST /api/admin/professional/releases
    POST /api/admin/professional/releases/upload
    POST /api/admin/professional/releases/archive
  ============================================================
*/


module.exports = function professionalReleaseRoutes({
  supabase
} = {}) {
  if (!supabase) {
    throw new Error(
      "professionalReleaseRoutes requires supabase."
    );
  }

  const router = express.Router();

  const releaseService =
    createProfessionalReleaseService({
      supabase
    });


  /*
    ============================================================
    MULTER CONFIG
    ============================================================
  */

  const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1
    },

    fileFilter: (
      req,
      file,
      callback
    ) => {
      try {
        const originalName =
          String(
            file?.originalname || ""
          ).trim();

        const extensionAllowed =
          originalName
            .toLowerCase()
            .endsWith(".xlsm");

        const mimeType =
          String(
            file?.mimetype || ""
          ).trim();

        const mimeAllowed =
          !mimeType ||
          mimeType === XLSM_MIME_TYPE ||
          mimeType ===
            "application/octet-stream" ||
          mimeType ===
            "application/vnd.ms-excel";

        if (!extensionAllowed) {
          const error = new Error(
            "Only .xlsm files are allowed."
          );

          error.statusCode = 400;
          error.code =
            "INVALID_FILE_EXTENSION";

          return callback(
            error,
            false
          );
        }

        /*
          Some browsers may send a generic MIME type.
          The .xlsm extension remains the primary check.
        */

        if (!mimeAllowed) {
          console.warn(
            "[Professional Release Upload] " +
            "Unexpected MIME type:",
            mimeType
          );
        }

        return callback(
          null,
          true
        );

      } catch (error) {
        return callback(
          error,
          false
        );
      }
    }
  });


  /*
    ============================================================
    HELPERS
    ============================================================
  */

  function getErrorStatus(error) {
    const statusCode =
      Number(
        error?.statusCode ||
        error?.status ||
        500
      );

    if (
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode <= 599
    ) {
      return statusCode;
    }

    return 500;
  }


  function sendError(
    res,
    error,
    context
  ) {
    const statusCode =
      getErrorStatus(error);

    const message =
      error?.message ||
      "Internal server error.";

    const code =
      error?.code ||
      "INTERNAL_ERROR";

    console.error(
      `[${context}]`,
      {
        statusCode,
        code,
        message,
        stack: error?.stack
      }
    );

    return res
      .status(statusCode)
      .json({
        success: false,
        message,
        code
      });
  }


  function asyncRoute(handler) {
    return async (
      req,
      res,
      next
    ) => {
      try {
        await handler(
          req,
          res,
          next
        );
      } catch (error) {
        next(error);
      }
    };
  }


  /*
    ============================================================
    GET RELEASES

    GET /api/admin/professional/releases

    Query examples:

      ?latest=true
      ?status=DRAFT
      ?limit=20
  ============================================================
  */

  router.get(
    "/",

    asyncRoute(
      async (req, res) => {
        const latest =
          String(
            req.query?.latest || ""
          ).toLowerCase() === "true";

        if (latest) {
          const result =
            await releaseService
              .getLatestRelease();

          return res
            .status(200)
            .json({
              success: true,
              message:
                result.data
                  ? "Latest Professional release loaded successfully."
                  : "No Professional release found.",
              ...result
            });
        }

        const result =
          await releaseService
            .getReleases({
              limit:
                req.query?.limit,

              status:
                req.query?.status ||
                null
            });

        return res
          .status(200)
          .json({
            success: true,
            message:
              "Professional releases loaded successfully.",
            ...result
          });
      }
    )
  );


  /*
    ============================================================
    SAVE DRAFT

    POST /api/admin/professional/releases

    Content-Type:
      application/json

    Body:
      version_name
      version_code
      release_title
      release_date
      developer_message
      release_notes
      is_force_update
      download_available

    The route always saves this endpoint as DRAFT.
  ============================================================
  */

  router.post(
    "/",

    asyncRoute(
      async (req, res) => {
        const result =
          await releaseService
            .saveReleaseDraft(
              req.body || {}
            );

        return res
          .status(200)
          .json({
            success: true,
            message:
              "Professional release draft saved successfully.",
            ...result
          });
      }
    )
  );


  /*
    ============================================================
    UPLOAD AND PUBLISH

    POST /api/admin/professional/releases/upload

    Content-Type:
      multipart/form-data

    File field:
      program_file

    Text fields:
      version_name
      version_code
      release_title
      release_date
      developer_message
      release_notes
      is_force_update
      download_available
  ============================================================
  */

  router.post(
    "/upload",

    upload.single(
      "program_file"
    ),

    asyncRoute(
      async (req, res) => {
        const result =
          await releaseService
            .uploadAndPublishRelease(
              req.body || {},
              req.file
            );

        return res
          .status(201)
          .json({
            success: true,
            message:
              "Professional release uploaded and published successfully.",
            ...result
          });
      }
    )
  );


  /*
    ============================================================
    ARCHIVE RELEASE

    POST /api/admin/professional/releases/archive

    Content-Type:
      application/json

    Body:
      version_code
  ============================================================
  */

  router.post(
    "/archive",

    asyncRoute(
      async (req, res) => {
        const versionCode =
          req.body?.version_code;

        const result =
          await releaseService
            .archiveRelease(
              versionCode
            );

        return res
          .status(200)
          .json({
            success: true,
            message:
              "Professional release archived successfully.",
            ...result
          });
      }
    )
  );


  /*
    ============================================================
    MULTER ERROR HANDLER
    ============================================================
  */

  router.use((
    error,
    req,
    res,
    next
  ) => {
    if (
      error instanceof multer.MulterError
    ) {
      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res
          .status(413)
          .json({
            success: false,
            message:
              "Program file exceeds the 50 MB limit.",
            code:
              "PROGRAM_FILE_TOO_LARGE"
          });
      }

      if (
        error.code ===
        "LIMIT_FILE_COUNT"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Only one program file may be uploaded.",
            code:
              "TOO_MANY_FILES"
          });
      }

      return res
        .status(400)
        .json({
          success: false,
          message:
            error.message ||
            "File upload failed.",
          code:
            error.code ||
            "MULTER_ERROR"
        });
    }

    return sendError(
      res,
      error,
      "Professional Release API"
    );
  });


  return router;
};
