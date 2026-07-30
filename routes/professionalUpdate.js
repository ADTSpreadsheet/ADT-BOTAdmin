"use strict";

const express = require("express");

const {
  createProfessionalUpdateService
} = require(
  "../services/professionalUpdateService"
);


/*
  ============================================================
  ADT-PILEFiX PROFESSIONAL PUBLIC UPDATE ROUTES
  File: routes/professionalUpdate.js

  Mount in server.js at:

    /api/professional/update

  Final endpoints:

    GET  /api/professional/update/latest
    POST /api/professional/update/download
  ============================================================
*/


module.exports = function professionalUpdateRoutes({
  supabase
} = {}) {
  if (!supabase) {
    throw new Error(
      "professionalUpdateRoutes requires supabase."
    );
  }

  const router = express.Router();

  const updateService =
    createProfessionalUpdateService({
      supabase
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
    GET LATEST PROFESSIONAL UPDATE

    GET /api/professional/update/latest
  ============================================================
  */

  router.get(
    "/latest",

    asyncRoute(
      async (req, res) => {
        const result =
          await updateService
            .getLatestUpdate();

        return res
          .status(200)
          .json({
            success: true,

            message:
              result.data
                ? "Latest Professional update loaded successfully."
                : "No active Professional update found.",

            ...result
          });
      }
    )
  );


  /*
    ============================================================
    CREATE SIGNED DOWNLOAD LINK

    POST /api/professional/update/download

    Content-Type:
      application/json

    Body:
      booking_no
      machine_id
      version_code
  ============================================================
  */

  router.post(
    "/download",

    asyncRoute(
      async (req, res) => {
        const result =
          await updateService
            .createDownloadLink(
              req.body || {}
            );

        return res
          .status(200)
          .json({
            success: true,
            message:
              "Professional download link created successfully.",
            ...result
          });
      }
    )
  );


  /*
    ============================================================
    ROUTE ERROR HANDLER
  ============================================================
  */

  router.use((
    error,
    req,
    res,
    next
  ) => {
    const statusCode =
      getErrorStatus(error);

    const code =
      error?.code ||
      "INTERNAL_ERROR";

    const message =
      error?.message ||
      "Internal server error.";

    console.error(
      "[Professional Update API]",
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
  });


  return router;
};
