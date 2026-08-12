use miette::Diagnostic;
use thiserror::Error;

pub type ConfigResult<T> = Result<T, ConfigError>;
pub type CoreResult<T> = Result<T, CoreError>;

#[derive(Debug, Error, Diagnostic)]
pub enum ConfigError {
    #[error("failed to read project config")]
    #[diagnostic(code(doki::config::io), help("ensure doki.toml exists under the project root"))]
    Io {
        #[source]
        source: std::io::Error,
    },

    #[error("invalid project configuration")]
    #[diagnostic(code(doki::config::extract))]
    Extract {
        #[source]
        source: figment::Error,
    },

    #[error("{message}")]
    #[diagnostic(code(doki::config::invalid))]
    Invalid { message: String },
}

impl ConfigError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::Invalid {
            message: message.into(),
        }
    }
}

#[derive(Debug, Error, Diagnostic)]
pub enum CoreError {
    #[error(transparent)]
    #[diagnostic(transparent)]
    Config(#[from] ConfigError),

    #[error("failed to access project files")]
    #[diagnostic(code(doki::io))]
    Io {
        #[source]
        source: std::io::Error,
    },

    #[error("{message}")]
    #[diagnostic(code(doki::session::invalid))]
    Session { message: String },

    #[error("{message}")]
    #[diagnostic(code(doki::build::invalid))]
    Build { message: String },
}

impl CoreError {
    pub fn session(message: impl Into<String>) -> Self {
        Self::Session {
            message: message.into(),
        }
    }

    pub fn build(message: impl Into<String>) -> Self {
        Self::Build {
            message: message.into(),
        }
    }
}
