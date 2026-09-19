<?php

namespace App\Http\Requests\Profile\Concerns;

use Illuminate\Contracts\Validation\Validator;

trait RejectsUnexpectedProfileFields
{
    /**
     * @param  list<string>  $allowedKeys
     */
    protected function rejectUnexpectedKeys(Validator $validator, array $allowedKeys): void
    {
        $validator->after(function (Validator $validator) use ($allowedKeys): void {
            foreach (array_keys($this->all()) as $key) {
                if (! in_array($key, $allowedKeys, true)) {
                    $validator->errors()->add(
                        (string) $key,
                        'The '.(string) $key.' field is not allowed.'
                    );
                }
            }
        });
    }
}
