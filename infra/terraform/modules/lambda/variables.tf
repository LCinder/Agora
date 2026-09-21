variable "name" {
  description = "Function name, also used for the role and the log group."
  type        = string
}

variable "source_dir" {
  description = "Directory that gets zipped and deployed."
  type        = string
}

variable "handler" {
  type    = string
  default = "index.handler" # index.mjs, ES module
}

variable "timeout" {
  type    = number
  default = 10
}

variable "memory_size" {
  description = "More memory also means more CPU, so a heavier default is often cheaper per request, not dearer."
  type        = number
  default     = 512
}

variable "environment_variables" {
  type    = map(string)
  default = {}
}

variable "policy_json" {
  description = "What this function is allowed to touch, beyond writing its own logs. Required: a function that declares nothing is a mistake, not a default."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 14
}
