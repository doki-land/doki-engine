use napi::Status;

#[derive(Debug)]
pub struct NodeError {
    pub message: String,
}

impl NodeError {
    pub fn invalid(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    pub fn from_core(err: template_framework_doki::CoreError) -> Self {
        // Prefer chain so Figment extract reasons reach the CLI.
        let message = match &err {
            template_framework_doki::CoreError::Config(cfg) => match cfg {
                template_framework_doki::ConfigError::Extract { source } => {
                    format!("invalid project configuration: {source}")
                }
                other => other.to_string(),
            },
            other => other.to_string(),
        };
        Self { message }
    }
}

pub type NodeResult<T> = Result<T, NodeError>;

impl From<NodeError> for napi::Error {
    fn from(value: NodeError) -> Self {
        napi::Error::new(Status::GenericFailure, value.message)
    }
}
